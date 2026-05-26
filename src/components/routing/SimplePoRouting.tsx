"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Burlington / DD Discount routing — line-item PO table with auto-derived
// columns pulled from the SKU Master catalogue.
//
// Layout matches the user's reference spreadsheet exactly (16 columns):
//   PO No · Master PO · Suffix · Start Date · End Date · Product
//   · Orig PO Qty · Final PO Qty · Fulfillment · Qty (units) · Weight (lb)
//   · Cu Ft · # layers · # Pallets · height (in) · Hi
//
// Manual cells: PO number, dates, product, orig & final qty.
// Auto cells: everything else (derived from manual inputs + SKU master).
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { listSkuMaster } from "@/lib/skuMaster";
import {
  BRAND_CONFIG,
  defaultBurlingtonShipment,
  newBurlingtonLine,
} from "@/lib/constants";
import { saveSimplePoRecord } from "@/lib/history";
import { useShipmentStore } from "@/store/useShipmentStore";
import type { BrandKey, BurlingtonLine, SkuMasterRow } from "@/lib/types";

type Line = BurlingtonLine;

/**
 * Module-level fallback used by the selector when the store hasn't yet been
 * initialised with a `burlington` field. Stable reference (constructed once)
 * so React's useSyncExternalStore snapshot stays consistent across renders.
 * The component's mount-time `useEffect` writes a real default into the store,
 * after which this fallback is no longer hit.
 */
const FALLBACK_BURLINGTON = defaultBurlingtonShipment();

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString("en-US", { day: "numeric", month: "short" })
    .replace(",", "");
}

function nz(n: number | "" | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function fmtNum(n: number, digits = 2): string {
  if (!Number.isFinite(n) || n === 0) return "";
  return Number(n.toFixed(digits)).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

function fmtInt(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "";
  return Math.round(n).toLocaleString();
}

function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return "0%";
  return Math.round(n) + "%";
}

export default function SimplePoRouting({ brand }: { brand: BrandKey }) {
  const brandLabel = BRAND_CONFIG[brand]?.label ?? brand;

  // ── Store-backed Burlington / DD Discount routing state ──
  // Single source of truth in the Zustand store so the BOL tab can sync from
  // the routing data and so History → "Open Routing" re-hydrates the form.
  //
  // CRITICAL: this selector must return a stable reference when the underlying
  // field hasn't changed. Returning `?? defaultBurlingtonShipment()` inline
  // would create a fresh object on every call → React's useSyncExternalStore
  // sees a mismatched snapshot and triggers an infinite render loop. Read the
  // raw value; the useEffect below initialises it if missing (rare — happens
  // only if a legacy save replaces brandState with a record lacking the field).
  const storedBurlington = useShipmentStore(
    (s) => s.brandState[brand].burlington,
  );
  const setBurlington = useShipmentStore((s) => s.setBurlington);

  useEffect(() => {
    if (!storedBurlington) {
      setBurlington({});
    }
  }, [storedBurlington, setBurlington]);

  // Stable fallback so the first render before initialisation doesn't crash on
  // destructuring. The useEffect above writes the real defaults into the store
  // on the next tick — `lines` will then re-render with the persisted shape.
  const burlington = storedBurlington ?? FALLBACK_BURLINGTON;

  // Be defensive against partially-formed legacy data — fields can be missing
  // if a record was saved before the current schema settled.
  const poNumber = burlington.headerPo ?? "";
  const startDate = burlington.startDate ?? "";
  const endDate = burlington.endDate ?? "";
  // Memoised so `lines` keeps a stable reference unless the underlying array
  // truly changes — downstream useMemo deps depend on this.
  const lines = useMemo(
    () => (Array.isArray(burlington.lines) ? burlington.lines : []),
    [burlington.lines],
  );
  const palletConstants =
    burlington.palletConstants ?? FALLBACK_BURLINGTON.palletConstants;
  const palletCuFt = palletConstants.cuFt;
  const palletWt = palletConstants.wt;
  const maxPalletHeight = palletConstants.maxHeight;

  const setPoNumber = useCallback(
    (v: string) => setBurlington({ headerPo: v }),
    [setBurlington],
  );
  const setStartDate = useCallback(
    (v: string) => setBurlington({ startDate: v }),
    [setBurlington],
  );
  const setEndDate = useCallback(
    (v: string) => setBurlington({ endDate: v }),
    [setBurlington],
  );
  const setLines = useCallback(
    (next: Line[]) => setBurlington({ lines: next }),
    [setBurlington],
  );
  const patchPalletConstants = useCallback(
    (patch: Partial<typeof palletConstants>) =>
      setBurlington({ palletConstants: { ...palletConstants, ...patch } }),
    [palletConstants, setBurlington],
  );
  const setPalletCuFt = (v: number) => patchPalletConstants({ cuFt: v });
  const setPalletWt = (v: number) => patchPalletConstants({ wt: v });
  const setMaxPalletHeight = (v: number) => patchPalletConstants({ maxHeight: v });

  // ── Submit state ──
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const bumpDataVersion = useShipmentStore((s) => s.bumpDataVersion);
  const bolFormFromStore = useShipmentStore((s) => s.bol);

  // ── SKU Master lookup ──
  const [skus, setSkus] = useState<SkuMasterRow[]>([]);
  const [skuLoadErr, setSkuLoadErr] = useState("");

  const loadSkus = useCallback(async () => {
    setSkuLoadErr("");
    try {
      setSkus(await listSkuMaster());
    } catch (e) {
      setSkuLoadErr(e instanceof Error ? e.message : "Failed to load SKU Master.");
    }
  }, []);

  useEffect(() => {
    loadSkus();
  }, [loadSkus]);

  // Header PO fills in any row that hasn't been overridden yet (empty PO).
  // Rows that the user has explicitly edited to something different are left
  // alone — header is the default, not a forced override.
  useEffect(() => {
    if (!poNumber) return;
    const needsPatch = lines.some((r) => r.po.trim() === "");
    if (!needsPatch) return;
    setLines(
      lines.map((r) => (r.po.trim() === "" ? { ...r, po: poNumber } : r)),
    );
    // We intentionally do NOT include `lines` in deps — running this effect on
    // every line edit would clobber a row's PO right after the user typed it.
    // The header-PO drives the sync; line edits sync via `patchLine` directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poNumber]);

  const skuByCode = useMemo(() => {
    const m = new Map<string, SkuMasterRow>();
    skus.forEach((s) => m.set((s.item_code || "").toUpperCase(), s));
    return m;
  }, [skus]);

  // ── Derived from PO Number ──
  const masterPo = poNumber.length >= 2 ? poNumber.slice(0, -2) : "";
  const suffix = poNumber.length >= 2 ? poNumber.slice(-2) : "";

  // ── Compute per-row derived values ──
  const computed = useMemo(() => {
    return lines.map((line) => {
      const sku = skuByCode.get((line.product || "").toUpperCase().trim());
      const orig = nz(line.origQty);
      const final = nz(line.finalQty);
      const fulfillment = orig > 0 ? (final / orig) * 100 : 0;
      const qtyUnits = final * 10;
      const grossLb = nz(sku?.case_gross_wt_lb);
      const cube = nz(sku?.case_cube_cuft);
      const height = nz(sku?.case_height_in);
      // Hi is per-row state — user can override the SKU master default.
      const hiDisplay = nz(line.hi);
      const layers = hiDisplay > 0 ? final / hiDisplay : 0;
      const pallets = hiDisplay > 0 ? layers / hiDisplay : 0;
      const weightLb = final * grossLb;
      const cuFt = final * cube;
      return {
        sku,
        orig,
        final,
        fulfillment,
        qtyUnits,
        weightLb,
        cuFt,
        layers,
        pallets,
        height,
        hiDisplay,
      };
    });
  }, [lines, skuByCode]);

  const totals = useMemo(() => {
    let orig = 0,
      final = 0,
      qty = 0,
      sumWeight = 0,
      sumCu = 0,
      sumLayers = 0,
      sumHeight = 0;
    computed.forEach((c) => {
      orig += c.orig;
      final += c.final;
      qty += c.qtyUnits;
      sumWeight += c.weightLb;
      sumCu += c.cuFt;
      sumLayers += c.layers;
      sumHeight += c.height;
    });
    const maxH = nz(maxPalletHeight);
    // Burlington / DD Discount pallet math:
    //   pallets = (Σ layers × Σ height) / max-pallet-height-without-pallet
    //   weight  = Σ weight + pallet wt × pallets
    //   cu ft   = Σ cu ft  + pallet cu ft × pallets
    const pallets = maxH > 0 ? (sumLayers * sumHeight) / maxH : 0;
    const weight = sumWeight + nz(palletWt) * pallets;
    const cu = sumCu + nz(palletCuFt) * pallets;
    const fulfillment = orig > 0 ? (final / orig) * 100 : 0;
    return {
      orig,
      final,
      qty,
      weight,
      cu,
      layers: sumLayers,
      pallets,
      fulfillment,
      sumHeight,
    };
  }, [computed, maxPalletHeight, palletWt, palletCuFt]);

  function patchLine(id: string, patch: Partial<Line>) {
    setLines(
      lines.map((r) => {
        if (r._id !== id) return r;
        const next = { ...r, ...patch };
        // When the Product changes to a known SKU, auto-fill Hi from the
        // catalogue. Honor an explicit user-typed Hi in the same patch (so
        // bulk edits don't clobber each other).
        if (patch.product !== undefined && patch.hi === undefined) {
          const sku = skuByCode.get((next.product || "").toUpperCase().trim());
          if (sku && typeof sku.pallet_ti === "number" && sku.pallet_ti > 0) {
            next.hi = sku.pallet_ti;
          }
        }
        return next;
      }),
    );
  }

  function addLine() {
    setLines([...lines, newBurlingtonLine()]);
  }

  function removeLine(id: string) {
    setLines(lines.filter((r) => r._id !== id));
  }

  function resetAll() {
    if (!window.confirm("Clear the PO and all line items?")) return;
    setBurlington(defaultBurlingtonShipment());
    setSubmitMsg(null);
  }

  const filledLines = useMemo(
    () =>
      lines.filter(
        (l) => l.product.trim() !== "" || l.origQty !== "" || l.finalQty !== "",
      ),
    [lines],
  );
  const canSubmit = poNumber.trim() !== "" && filledLines.length > 0;

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const rec = await saveSimplePoRecord({
        brand,
        burlington: {
          headerPo: poNumber.trim(),
          startDate,
          endDate,
          palletConstants: {
            cuFt: nz(palletCuFt),
            wt: nz(palletWt),
            maxHeight: nz(maxPalletHeight),
          },
          lines: filledLines.map((l) => ({
            _id: l._id,
            po: (l.po || poNumber).trim(),
            product: l.product.trim().toUpperCase(),
            origQty: nz(l.origQty),
            finalQty: nz(l.finalQty),
            hi: nz(l.hi),
          })),
        },
        totals: {
          finalQty: totals.final,
          weight: totals.weight,
          cu: totals.cu,
          pallets: totals.pallets,
        },
        // Carry whatever the user has set on the BOL tab so it survives recall.
        bol: bolFormFromStore,
      });
      bumpDataVersion();
      setSubmitMsg({
        kind: "ok",
        msg: `✓ PO ${rec.po_number} saved to the PO list. It's now searchable from History.`,
      });
    } catch (err) {
      setSubmitMsg({
        kind: "err",
        msg: "✗ " + (err instanceof Error ? err.message : "Could not save the PO."),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="qt-simple">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .qt-simple { display: flex; flex-direction: column; gap: 14px; }
            .qt-simple-card {
              background: #fff;
              border: 1px solid #e6e0d4;
              border-radius: 14px;
              padding: 18px 22px;
            }
            .qt-simple-head {
              display: flex; justify-content: space-between; align-items: flex-start;
              flex-wrap: wrap; gap: 14px;
            }
            .qt-simple-title {
              font-family: Georgia, serif; font-size: 16px; font-weight: 700; color: #1a2a3a;
            }
            .qt-simple-sub {
              font-size: 12px; color: #6e6960; line-height: 1.5; margin-top: 3px;
            }
            .qt-simple-actions { display: flex; gap: 8px; flex-wrap: wrap; }
            .qt-simple-btn {
              padding: 8px 14px; background: #0e3a66; color: #fff; border: none;
              border-radius: 8px; font-size: 12px; font-weight: 600; letter-spacing: 0.3px;
              cursor: pointer; font-family: inherit;
              transition: background 0.15s, transform 0.15s;
            }
            .qt-simple-btn:hover { background: #082a4f; transform: translateY(-1px); }
            .qt-simple-btn.ghost {
              background: transparent; color: #0e3a66; border: 1px solid #e6e0d4;
            }
            .qt-simple-btn.ghost:hover { background: #f0ede6; }
            .qt-simple-btn.accent { background: #e8593c; }
            .qt-simple-btn.accent:hover { background: #c94628; }
            .qt-simple-btn.danger { background: transparent; color: #c94628; border: 1px solid transparent; padding: 2px 7px; font-size: 14px; }
            .qt-simple-btn.danger:hover { background: #fdece6; }

            .qt-simple-form {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 14px;
              margin-top: 16px;
            }
            .qt-simple-field { display: flex; flex-direction: column; gap: 6px; }
            .qt-simple-field label {
              font-size: 10.5px; font-weight: 600; letter-spacing: 0.4px;
              text-transform: uppercase; color: #6e6960;
            }
            .qt-simple-field input {
              padding: 9px 12px;
              border: 1.5px solid #d6ccb8;
              border-radius: 8px;
              background: #f6f3ec;
              font-size: 13px; color: #25303f; font-family: inherit;
              outline: none; transition: border-color 0.15s, background 0.15s;
              font-variant-numeric: tabular-nums;
            }
            .qt-simple-field input:focus {
              border-color: #0e3a66; background: #fff;
              box-shadow: 0 0 0 2px rgba(14,58,102,0.1);
            }
            .qt-simple-derived {
              display: flex; gap: 18px; flex-wrap: wrap;
              padding-top: 10px; margin-top: 4px;
              font-size: 12px; color: #6e6960;
            }
            .qt-simple-derived strong {
              color: #0e3a66; font-variant-numeric: tabular-nums;
            }

            .qt-simple-tablewrap {
              overflow-x: auto;
              border: 1px solid #e6e0d4;
              border-radius: 10px;
            }
            .qt-simple-table {
              border-collapse: collapse;
              font-size: 12px;
              min-width: 100%;
              font-variant-numeric: tabular-nums;
            }
            .qt-simple-table thead th {
              padding: 9px 8px;
              background: #f6f3ec;
              color: #5a6370;
              font-size: 10.5px;
              font-weight: 700;
              letter-spacing: 0.04em;
              text-align: left;
              border-bottom: 1.5px solid #d6ccb8;
              border-right: 1px solid #ede6d6;
              white-space: nowrap;
              position: sticky;
              top: 0;
              z-index: 1;
            }
            .qt-simple-table thead th.num { text-align: right; }
            .qt-simple-table tbody td {
              padding: 5px 8px;
              border-bottom: 1px solid #f3eee5;
              border-right: 1px solid #f3eee5;
              color: #25303f;
              vertical-align: middle;
              white-space: nowrap;
            }
            .qt-simple-table tbody td.num { text-align: right; }
            .qt-simple-table tbody td.derived { background: #fafaf5; color: #3a4a5c; font-weight: 600; }
            .qt-simple-table tbody td.derived-mute { background: #fafaf5; color: #aaa; }
            .qt-simple-table tbody td.manual-empty { background: #effaef; }
            .qt-simple-table tbody td.manual { background: #effaef; }
            .qt-simple-table tbody td.po-cell { font-weight: 700; color: #0e3a66; }
            .qt-simple-table tbody tr.total-row td {
              background: #fdf2dc !important;
              font-weight: 700;
              border-top: 1.5px solid #d6ccb8;
              padding-top: 8px; padding-bottom: 8px;
            }
            .qt-simple-table input {
              width: 100%;
              padding: 4px 7px;
              border: 1.5px solid transparent;
              border-radius: 5px;
              background: transparent;
              font-size: 12px; color: #25303f;
              font-family: inherit; outline: none;
              transition: border-color 0.12s, background 0.12s, box-shadow 0.12s;
              font-variant-numeric: tabular-nums;
            }
            .qt-simple-table input:focus {
              border-color: #0e3a66; background: #fff;
              box-shadow: 0 0 0 2px rgba(14,58,102,0.1);
            }
            .qt-simple-table input[type="number"] { text-align: right; }

            .qt-simple-pill {
              display: inline-flex; align-items: center; gap: 4px;
              padding: 1px 7px;
              border-radius: 999px; font-size: 10.5px; font-weight: 700;
              letter-spacing: 0.3px;
            }
            .qt-simple-pill.green  { background: #e8f6ee; color: #1e7a4a; }
            .qt-simple-pill.amber  { background: #fdf2dc; color: #a47712; }
            .qt-simple-pill.red    { background: #fdece6; color: #c94628; }
            .qt-simple-warn {
              padding: 8px 12px;
              background: #fdf2dc;
              color: #8a5a08;
              font-size: 11.5px;
              border-radius: 8px;
            }

            /* Pallet-constants strip (Burlington / DD Discount). */
            .qt-pallet-const { padding: 14px 18px; }
            .qt-pallet-const-title {
              font-family: Georgia, serif;
              font-size: 14px;
              font-weight: 700;
              color: #1a2a3a;
              margin-bottom: 4px;
            }
            .qt-pallet-const-sub {
              font-size: 11.5px;
              color: #6e6960;
              margin-bottom: 10px;
              line-height: 1.5;
            }
            .qt-pallet-const-table {
              border-collapse: collapse;
              font-size: 12.5px;
              font-variant-numeric: tabular-nums;
              width: 100%;
              max-width: 460px;
            }
            .qt-pallet-const-table td {
              padding: 6px 10px;
              border: 1px solid #e6e0d4;
              color: #25303f;
            }
            .qt-pallet-const-table td.label {
              background: #f6f3ec;
              font-weight: 700;
              color: #5a6370;
              width: 70%;
            }
            .qt-pallet-const-table td.val { text-align: right; padding: 2px 6px; }
            .qt-pallet-const-table input {
              width: 100%;
              padding: 5px 8px;
              border: 1.5px solid transparent;
              border-radius: 5px;
              background: transparent;
              font-size: 12.5px;
              color: #25303f;
              font-family: inherit;
              outline: none;
              text-align: right;
              font-variant-numeric: tabular-nums;
              transition: border-color 0.12s, background 0.12s, box-shadow 0.12s;
            }
            .qt-pallet-const-table input:focus {
              border-color: #0e3a66;
              background: #fff;
              box-shadow: 0 0 0 2px rgba(14,58,102,0.1);
            }
          `,
        }}
      />

      {/* ── PO HEADER ── */}
      <div className="qt-simple-card">
        <div className="qt-simple-head">
          <div>
            <div className="qt-simple-title">{brandLabel} Routing</div>
            <div className="qt-simple-sub">
              Enter the PO number and dates once — they apply to every line below. Product values
              auto-fill from SKU Master.
            </div>
          </div>
          <div className="qt-simple-actions">
            <button type="button" className="qt-simple-btn ghost" onClick={loadSkus}>
              ↻ Reload SKUs
            </button>
            <button type="button" className="qt-simple-btn ghost" onClick={resetAll}>
              ✕ Reset
            </button>
            <button type="button" className="qt-simple-btn accent" onClick={addLine}>
              + Add Line
            </button>
          </div>
        </div>

        {skuLoadErr && (
          <div className="qt-simple-warn" style={{ marginTop: 12 }}>
            ⚠ {skuLoadErr}
          </div>
        )}
        {!skuLoadErr && skus.length === 0 && (
          <div className="qt-simple-warn" style={{ marginTop: 12 }}>
            No SKUs in the catalogue yet. Add some on the <strong>SKU Master</strong> tab first, or the
            auto-fill columns will stay blank.
          </div>
        )}

        <div className="qt-simple-form">
          <div className="qt-simple-field">
            <label>PO No.</label>
            <input
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              placeholder="e.g. 80694523"
            />
          </div>
          <div className="qt-simple-field">
            <label>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="qt-simple-field">
            <label>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="qt-simple-derived">
          <span>
            Master PO #: <strong>{masterPo || "—"}</strong>
          </span>
          <span>
            Suffix: <strong>{suffix || "—"}</strong>
          </span>
        </div>
      </div>

      {/* ── PALLET CONSTANTS ── */}
      <div className="qt-simple-card qt-pallet-const">
        <div className="qt-pallet-const-title">Pallet Constants</div>
        <div className="qt-pallet-const-sub">
          Used to compute the bottom-row totals for {brandLabel}. Override per shipment if
          needed.
        </div>
        <table className="qt-pallet-const-table">
          <tbody>
            <tr>
              <td className="label">Pallet Cu ft</td>
              <td className="val">
                <input
                  type="number"
                  step="0.1"
                  min={0}
                  value={palletCuFt || ""}
                  onChange={(e) =>
                    setPalletCuFt(parseFloat(e.target.value) || 0)
                  }
                />
              </td>
            </tr>
            <tr>
              <td className="label">Pallet wt (lb)</td>
              <td className="val">
                <input
                  type="number"
                  step="1"
                  min={0}
                  value={palletWt || ""}
                  onChange={(e) =>
                    setPalletWt(parseFloat(e.target.value) || 0)
                  }
                />
              </td>
            </tr>
            <tr>
              <td className="label">Max Pallet height without pallet (in)</td>
              <td className="val">
                <input
                  type="number"
                  step="1"
                  min={0}
                  value={maxPalletHeight || ""}
                  onChange={(e) =>
                    setMaxPalletHeight(parseFloat(e.target.value) || 0)
                  }
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── LINE-ITEM TABLE ── */}
      <div className="qt-simple-card" style={{ padding: 0 }}>
        <div className="qt-simple-tablewrap">
          {/* datalist for product autocomplete */}
          <datalist id={`sku-datalist-${brand}`}>
            {skus.map((s) => (
              <option
                key={s.id}
                value={s.item_code}
                label={s.item_description ?? undefined}
              />
            ))}
          </datalist>

          <table className="qt-simple-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>#</th>
                <th>PO No.</th>
                <th>Master PO #</th>
                <th>Suffix</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Product</th>
                <th className="num">Orig PO Qty</th>
                <th className="num">Final PO Qty</th>
                <th className="num">Fulfillment</th>
                <th className="num">Qty (units)</th>
                <th className="num">Weight (lb)</th>
                <th className="num">Cu Ft</th>
                <th className="num"># layers</th>
                <th className="num"># Pallets</th>
                <th className="num">height (in)</th>
                <th className="num">Hi</th>
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const c = computed[idx];
                const skuFound = !!c.sku;
                const productEntered = !!line.product?.trim();
                const fulfillClass =
                  c.fulfillment >= 95 ? "green" : c.fulfillment >= 50 ? "amber" : "red";

                return (
                  <tr key={line._id}>
                    <td style={{ color: "#888", fontWeight: 600 }}>{idx + 1}</td>

                    <td className={line.po ? "manual po-cell" : "manual-empty"}>
                      <input
                        value={line.po}
                        onChange={(e) =>
                          patchLine(line._id, { po: e.target.value })
                        }
                        placeholder={poNumber || "—"}
                        title="Editable per row — defaults to the header PO above"
                      />
                    </td>
                    <td className={line.po.length >= 2 ? "derived" : "derived-mute"}>
                      {line.po.length >= 2 ? line.po.slice(0, -2) : "—"}
                    </td>
                    <td className={line.po.length >= 2 ? "derived" : "derived-mute"}>
                      {line.po.length >= 2 ? line.po.slice(-2) : "—"}
                    </td>
                    <td className={startDate ? "derived" : "derived-mute"}>
                      {formatDate(startDate) || "—"}
                    </td>
                    <td className={endDate ? "derived" : "derived-mute"}>
                      {formatDate(endDate) || "—"}
                    </td>

                    <td className={productEntered ? "manual" : "manual-empty"}>
                      <input
                        list={`sku-datalist-${brand}`}
                        value={line.product}
                        onChange={(e) =>
                          patchLine(line._id, { product: e.target.value.toUpperCase() })
                        }
                        placeholder="QT12"
                        style={
                          productEntered && !skuFound
                            ? { color: "#c94628" }
                            : undefined
                        }
                        title={
                          productEntered && !skuFound
                            ? "This SKU isn't in the SKU Master — derived columns can't be computed."
                            : c.sku?.item_description ?? ""
                        }
                      />
                    </td>
                    <td className={line.origQty !== "" ? "manual num" : "manual-empty num"}>
                      <input
                        type="number"
                        min={0}
                        value={line.origQty}
                        onChange={(e) =>
                          patchLine(line._id, {
                            origQty:
                              e.target.value === "" ? "" : parseInt(e.target.value, 10) || 0,
                          })
                        }
                      />
                    </td>
                    <td className={line.finalQty !== "" ? "manual num" : "manual-empty num"}>
                      <input
                        type="number"
                        min={0}
                        value={line.finalQty}
                        onChange={(e) =>
                          patchLine(line._id, {
                            finalQty:
                              e.target.value === "" ? "" : parseInt(e.target.value, 10) || 0,
                          })
                        }
                      />
                    </td>

                    <td className="derived num">
                      {c.orig > 0 ? (
                        <span className={`qt-simple-pill ${fulfillClass}`}>
                          {fmtPct(c.fulfillment)}
                        </span>
                      ) : (
                        <span style={{ color: "#bbb" }}>0%</span>
                      )}
                    </td>
                    <td className="derived num">{fmtInt(c.qtyUnits) || "—"}</td>
                    <td className="derived num">{fmtNum(c.weightLb, 0) || "—"}</td>
                    <td className="derived num">{fmtNum(c.cuFt, 2) || "—"}</td>
                    <td className="derived num">{fmtNum(c.layers, 1) || "—"}</td>
                    <td className="derived num">{fmtNum(c.pallets, 2) || "—"}</td>
                    <td className="derived num">{fmtNum(c.height, 1) || "—"}</td>
                    <td className={line.hi !== "" ? "manual num" : "manual-empty num"}>
                      <input
                        type="number"
                        min={0}
                        value={line.hi}
                        onChange={(e) =>
                          patchLine(line._id, {
                            hi:
                              e.target.value === "" ? "" : parseInt(e.target.value, 10) || 0,
                          })
                        }
                        title="Pulled from SKU Master · click to override for this row only"
                      />
                    </td>

                    <td>
                      <button
                        type="button"
                        className="qt-simple-btn danger"
                        onClick={() => removeLine(line._id)}
                        title="Remove this line"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* Total row */}
              <tr className="total-row">
                <td colSpan={7} style={{ textAlign: "right" }}>Total PO</td>
                <td className="num">{fmtInt(totals.orig) || "—"}</td>
                <td className="num">{fmtInt(totals.final) || "—"}</td>
                <td className="num">
                  {totals.orig > 0 ? (
                    <span
                      className={`qt-simple-pill ${
                        totals.fulfillment >= 95
                          ? "green"
                          : totals.fulfillment >= 50
                          ? "amber"
                          : "red"
                      }`}
                    >
                      {fmtPct(totals.fulfillment)}
                    </span>
                  ) : (
                    "0%"
                  )}
                </td>
                <td className="num">{fmtInt(totals.qty) || "—"}</td>
                <td className="num">{fmtNum(totals.weight, 0) || "—"}</td>
                <td className="num">{fmtNum(totals.cu, 2) || "—"}</td>
                <td className="num">{fmtNum(totals.layers, 1) || "—"}</td>
                <td className="num">{fmtNum(totals.pallets, 2) || "—"}</td>
                <td className="num">{fmtNum(totals.sumHeight, 1) || "—"}</td>
                <td></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SUBMIT — save this PO into the shared list ── */}
      <div className="qt-simple-card">
        <div className="qt-simple-title">Submit Routing</div>
        <div className="qt-simple-sub" style={{ marginBottom: 14 }}>
          Save this {brandLabel} PO into the shared <strong>PO list</strong>. Once submitted, it&apos;ll
          show up on the <strong>History</strong> tab and is keyed by the header PO number above.
          Per-row POs are preserved inside the snapshot.
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="qt-simple-btn accent"
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            title={
              canSubmit
                ? "Save this PO to the shared list"
                : "Set the header PO above and add at least one line item first"
            }
            style={{ padding: "10px 22px", fontSize: 13 }}
          >
            {submitting ? "Submitting…" : "✓ Submit & Save to PO List"}
          </button>
          {!canSubmit && (
            <span style={{ fontSize: 12, color: "#a47712" }}>
              {!poNumber.trim()
                ? "Set the PO number above."
                : "Add at least one line item with a product or qty."}
            </span>
          )}
        </div>
        {submitMsg && (
          <div
            className="qt-simple-warn"
            style={{
              marginTop: 12,
              background: submitMsg.kind === "ok" ? "#e8f6ee" : "#fdece6",
              color: submitMsg.kind === "ok" ? "#1e7a4a" : "#c94628",
            }}
          >
            {submitMsg.msg}
          </div>
        )}
      </div>
    </div>
  );
}
