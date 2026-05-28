"use client";

// ─────────────────────────────────────────────────────────────────────────────
// Sierra Trading Post routing — mirrors `siara routing.xlsx` exactly.
//
// Columns (per product row):
//   #  Product  | Orig DC1 (units)  Orig DC2 (units)  Orig Cases  Orig Units
//              | Final DC1 (cases) Final DC2 (cases) Final Cases Final Units
//              | Cu ft / case      Cu ft DC1         Cu ft DC2
//
// Simple formulas (matching the customer's Excel):
//   Orig Cases   = Σ(orig per DC) / 10
//   Orig Units   = Σ(orig per DC)
//   Final Cases  = Σ(final per DC)
//   Final Units  = Final Cases × 10
//   Cu ft / case = SKU Master `case_cube_cuft`
//   Cu ft DC_n   = final[DC_n] × Cu ft / case
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useState } from "react";
import { useShipmentStore } from "@/store/useShipmentStore";
import {
  BRAND_CONFIG,
  defaultSierraShipment,
  newSierraLine,
  SIERRA_WEIGHT_PER_UNIT,
  SIERRA_WEIGHT_BASES,
} from "@/lib/constants";
import { listSkuMaster } from "@/lib/skuMaster";
import { saveSierraPoRecord } from "@/lib/history";
import type {
  BrandKey,
  SierraDc,
  SierraLine,
  SkuMasterRow,
} from "@/lib/types";

/**
 * Module-level stable fallback so the selector returns the same reference
 * across renders before the store is initialised — same pattern as
 * SimplePoRouting's FALLBACK_BURLINGTON. Avoids the
 * "Application error: useSyncExternalStore" infinite-render loop.
 */
const FALLBACK_SIERRA = defaultSierraShipment();

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

export default function SierraRouting({ brand }: { brand: BrandKey }) {
  const brandLabel = BRAND_CONFIG[brand]?.label ?? brand;

  const stored = useShipmentStore((s) => s.brandState[brand].sierra);
  const setSierra = useShipmentStore((s) => s.setSierra);
  const bolFromStore = useShipmentStore((s) => s.bol);
  const formatFromStore = useShipmentStore((s) => s.format);
  const bumpDataVersion = useShipmentStore((s) => s.bumpDataVersion);

  useEffect(() => {
    if (!stored) setSierra({});
  }, [stored, setSierra]);

  // ── Submit state ──
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<
    { kind: "ok" | "err"; msg: string } | null
  >(null);

  const sierra = stored ?? FALLBACK_SIERRA;
  const poNumber = sierra.poNumber ?? "";
  const dcs: SierraDc[] = Array.isArray(sierra.dcs) ? sierra.dcs : FALLBACK_SIERRA.dcs;
  const lines = useMemo(
    () => (Array.isArray(sierra.lines) ? sierra.lines : []),
    [sierra.lines],
  );

  const setPoNumber = useCallback(
    (v: string) => setSierra({ poNumber: v }),
    [setSierra],
  );
  const setLines = useCallback(
    (next: SierraLine[]) => setSierra({ lines: next }),
    [setSierra],
  );

  // ── SKU Master lookup (drives the Cu ft / case column). ──
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
  const skuByCode = useMemo(() => {
    const m = new Map<string, SkuMasterRow>();
    skus.forEach((s) => m.set((s.item_code || "").toUpperCase().trim(), s));
    return m;
  }, [skus]);

  // ── Per-row derived values ──
  const computed = useMemo(() => {
    return lines.map((line) => {
      const sku = skuByCode.get((line.product || "").toUpperCase().trim());
      const cuftPerCase = nz(sku?.case_cube_cuft);

      let origUnitsTotal = 0;
      let finalCasesTotal = 0;
      const cuFtPerDc: Record<string, number> = {};

      dcs.forEach((d) => {
        const orig = nz(line.orig?.[d.num]);
        const final = nz(line.final?.[d.num]);
        origUnitsTotal += orig;
        finalCasesTotal += final;
        cuFtPerDc[d.num] = final * cuftPerCase;
      });

      const origCasesTotal = origUnitsTotal / 10;
      const finalUnitsTotal = finalCasesTotal * 10;
      return {
        sku,
        cuftPerCase,
        origUnitsTotal,
        origCasesTotal,
        finalCasesTotal,
        finalUnitsTotal,
        cuFtPerDc,
      };
    });
  }, [lines, skuByCode, dcs]);

  // ── Grand totals per column ──
  const totals = useMemo(() => {
    const origPerDc: Record<string, number> = {};
    const finalPerDc: Record<string, number> = {};
    const cuftPerDc: Record<string, number> = {};
    dcs.forEach((d) => {
      origPerDc[d.num] = 0;
      finalPerDc[d.num] = 0;
      cuftPerDc[d.num] = 0;
    });
    let origCases = 0,
      origUnits = 0,
      finalCases = 0,
      finalUnits = 0;
    lines.forEach((line, i) => {
      const c = computed[i];
      dcs.forEach((d) => {
        origPerDc[d.num] += nz(line.orig?.[d.num]);
        finalPerDc[d.num] += nz(line.final?.[d.num]);
        cuftPerDc[d.num] += c.cuFtPerDc[d.num] ?? 0;
      });
      origUnits += c.origUnitsTotal;
      origCases += c.origCasesTotal;
      finalCases += c.finalCasesTotal;
      finalUnits += c.finalUnitsTotal;
    });
    return { origPerDc, finalPerDc, cuftPerDc, origCases, origUnits, finalCases, finalUnits };
  }, [lines, computed, dcs]);

  /**
   * Summary rows shown below the totals row — these match the bottom of the
   * customer's worksheet:
   *   total units (per DC) = per_dc × 10
   *   WEIGHT (per DC)       = per_dc × 8 + base   (base from SIERRA_WEIGHT_BASES)
   *   PALLET (per DC)       = 1 by default        (editable later if needed)
   *   WEIGHT ROUND UP       = Math.ceil(WEIGHT)   (rounded to integer lb)
   */
  const summary = useMemo(() => {
    const baseFor = (idx: number) =>
      SIERRA_WEIGHT_BASES[Math.min(idx, SIERRA_WEIGHT_BASES.length - 1)];

    const origTotalUnitsPerDc: Record<string, number> = {};
    const finalTotalUnitsPerDc: Record<string, number> = {};
    const origWeightPerDc: Record<string, number> = {};
    const finalWeightPerDc: Record<string, number> = {};
    const origPalletPerDc: Record<string, number> = {};
    const finalPalletPerDc: Record<string, number> = {};

    dcs.forEach((d, idx) => {
      const base = baseFor(idx);
      const origPerDc = totals.origPerDc[d.num] ?? 0;
      const finalPerDc = totals.finalPerDc[d.num] ?? 0;

      // total units / weight / pallet only have meaning once the user has
      // actually entered something for that DC — otherwise the base (90 /
      // 120 lb) and pallet=1 would show up on a completely blank table.
      origTotalUnitsPerDc[d.num] = origPerDc > 0 ? origPerDc * 10 : 0;
      finalTotalUnitsPerDc[d.num] = finalPerDc > 0 ? finalPerDc * 10 : 0;
      origWeightPerDc[d.num] = origPerDc > 0 ? origPerDc * SIERRA_WEIGHT_PER_UNIT + base : 0;
      finalWeightPerDc[d.num] = finalPerDc > 0 ? finalPerDc * SIERRA_WEIGHT_PER_UNIT + base : 0;
      origPalletPerDc[d.num] = origPerDc > 0 ? 1 : 0;
      finalPalletPerDc[d.num] = finalPerDc > 0 ? 1 : 0;
    });

    return {
      origTotalUnitsPerDc,
      finalTotalUnitsPerDc,
      origWeightPerDc,
      finalWeightPerDc,
      origPalletPerDc,
      finalPalletPerDc,
    };
  }, [totals.origPerDc, totals.finalPerDc, dcs]);

  function patchLine(id: string, patch: Partial<SierraLine>) {
    setLines(lines.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  }

  function patchOrig(id: string, dcNum: string, value: number | "") {
    setLines(
      lines.map((r) =>
        r._id === id ? { ...r, orig: { ...(r.orig || {}), [dcNum]: value } } : r,
      ),
    );
  }

  function patchFinal(id: string, dcNum: string, value: number | "") {
    setLines(
      lines.map((r) =>
        r._id === id ? { ...r, final: { ...(r.final || {}), [dcNum]: value } } : r,
      ),
    );
  }

  function addLine() {
    setLines([...lines, newSierraLine()]);
  }

  function removeLine(id: string) {
    setLines(lines.filter((r) => r._id !== id));
  }

  function resetAll() {
    if (!window.confirm("Clear the PO and all line items?")) return;
    setSierra(defaultSierraShipment());
    setSubmitMsg(null);
  }

  /** Submit-eligibility: PO + at least one product/DC with final cases. */
  const canSubmit = useMemo(() => {
    if (poNumber.trim() === "") return false;
    return lines.some(
      (l) =>
        (l.product || "").trim() !== "" &&
        dcs.some(
          (d) =>
            typeof l.final?.[d.num] === "number" &&
            (l.final[d.num] as number) > 0,
        ),
    );
  }, [poNumber, lines, dcs]);

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const rec = await saveSierraPoRecord({
        brand,
        sierra: {
          poNumber: poNumber.trim(),
          dcs,
          lines: lines.map((l) => ({ ...l })),
        },
        bol: bolFromStore,
        format: formatFromStore,
      });
      bumpDataVersion();
      setSubmitMsg({
        kind: "ok",
        msg: `✓ PO ${rec.po_number} saved. It's now in History and ready for Label generation.`,
      });
      // Reset so the form is clean for the next PO. The submitted PO is
      // still recallable from History.
      setSierra(defaultSierraShipment());
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
    <div className="qt-sierra">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .qt-sierra { display: flex; flex-direction: column; gap: 14px; }
            .qt-sierra-card {
              background: #fff;
              border: 1px solid #e6e0d4;
              border-radius: 14px;
              padding: 18px 22px;
            }
            .qt-sierra-head {
              display: flex; justify-content: space-between; align-items: flex-start;
              flex-wrap: wrap; gap: 14px;
            }
            .qt-sierra-title {
              font-family: Georgia, serif; font-size: 16px; font-weight: 700; color: #1a2a3a;
            }
            .qt-sierra-sub {
              font-size: 12px; color: #6e6960; line-height: 1.5; margin-top: 3px;
            }
            .qt-sierra-actions { display: flex; gap: 8px; flex-wrap: wrap; }
            .qt-sierra-btn {
              padding: 8px 14px; background: #0e3a66; color: #fff; border: none;
              border-radius: 8px; font-size: 12px; font-weight: 600; letter-spacing: 0.3px;
              cursor: pointer; font-family: inherit;
              transition: background 0.15s, transform 0.15s;
            }
            .qt-sierra-btn:hover { background: #082a4f; transform: translateY(-1px); }
            .qt-sierra-btn.ghost {
              background: transparent; color: #0e3a66; border: 1px solid #e6e0d4;
            }
            .qt-sierra-btn.ghost:hover { background: #f0ede6; }
            .qt-sierra-btn.accent { background: #e8593c; }
            .qt-sierra-btn.accent:hover { background: #c94628; }
            .qt-sierra-btn.danger {
              background: transparent; color: #c94628; border: 1px solid transparent;
              padding: 2px 7px; font-size: 14px;
            }
            .qt-sierra-btn.danger:hover { background: #fdece6; }

            .qt-sierra-poin {
              display: grid; grid-template-columns: 220px 1fr; gap: 14px;
              margin-top: 16px; align-items: center;
            }
            .qt-sierra-poin label {
              font-size: 10.5px; font-weight: 600; letter-spacing: 0.4px;
              text-transform: uppercase; color: #6e6960;
            }
            .qt-sierra-poin input {
              padding: 9px 12px;
              border: 1.5px solid #d6ccb8;
              border-radius: 8px;
              background: #f6f3ec;
              font-size: 13px; color: #25303f; font-family: inherit;
              outline: none; transition: border-color 0.15s, background 0.15s;
              font-variant-numeric: tabular-nums;
              max-width: 320px;
            }
            .qt-sierra-poin input:focus {
              border-color: #0e3a66; background: #fff;
              box-shadow: 0 0 0 2px rgba(14,58,102,0.1);
            }

            .qt-sierra-tablewrap {
              overflow-x: auto;
              border: 1px solid #e6e0d4;
              border-radius: 10px;
            }
            .qt-sierra-table {
              border-collapse: collapse;
              font-size: 12px;
              min-width: 100%;
              font-variant-numeric: tabular-nums;
            }
            .qt-sierra-table thead th {
              padding: 7px 8px;
              background: #f6f3ec;
              color: #5a6370;
              font-size: 10.5px;
              font-weight: 700;
              letter-spacing: 0.04em;
              text-align: center;
              border-bottom: 1.5px solid #d6ccb8;
              border-right: 1px solid #ede6d6;
              white-space: nowrap;
            }
            .qt-sierra-table thead th.section-orig { background: #fdf6e7; color: #8a5a08; }
            .qt-sierra-table thead th.section-final { background: #e8f6ee; color: #1e7a4a; }
            .qt-sierra-table thead th.section-cuft { background: #eef3fb; color: #0e3a66; }
            .qt-sierra-table tbody td {
              padding: 4px 6px;
              border-bottom: 1px solid #f3eee5;
              border-right: 1px solid #f3eee5;
              color: #25303f;
              vertical-align: middle;
              white-space: nowrap;
              text-align: right;
            }
            .qt-sierra-table tbody td.product-cell { text-align: left; }
            .qt-sierra-table tbody td.derived { background: #fafaf5; color: #3a4a5c; font-weight: 600; }
            .qt-sierra-table tbody td.derived-mute { background: #fafaf5; color: #aaa; }
            .qt-sierra-table tbody td.orig { background: #fdf6e7; }
            .qt-sierra-table tbody td.final { background: #e8f6ee; }
            .qt-sierra-table tbody td.cuft { background: #eef3fb; }
            .qt-sierra-table tbody tr.total-row td {
              background: #fdf2dc !important;
              font-weight: 700;
              border-top: 1.5px solid #d6ccb8;
              padding-top: 7px; padding-bottom: 7px;
            }
            .qt-sierra-table tbody tr.summary-row td {
              background: #f6f3ec !important;
              font-weight: 600;
              color: #25303f;
              padding-top: 6px; padding-bottom: 6px;
              font-size: 11.5px;
              letter-spacing: 0.02em;
            }
            .qt-sierra-table tbody tr.summary-row td:first-child + td {
              text-transform: uppercase;
              letter-spacing: 0.08em;
              color: #5a6370;
            }
            .qt-sierra-table input {
              width: 80px;
              padding: 4px 7px;
              border: 1.5px solid transparent;
              border-radius: 5px;
              background: transparent;
              font-size: 12px; color: #25303f;
              font-family: inherit; outline: none;
              transition: border-color 0.12s, background 0.12s, box-shadow 0.12s;
              font-variant-numeric: tabular-nums;
              text-align: right;
            }
            .qt-sierra-table input:focus {
              border-color: #0e3a66; background: #fff;
              box-shadow: 0 0 0 2px rgba(14,58,102,0.1);
            }
            .qt-sierra-table input.product-input {
              width: 90px; text-align: left;
            }

            .qt-sierra-warn {
              padding: 8px 12px;
              background: #fdf2dc;
              color: #8a5a08;
              font-size: 11.5px;
              border-radius: 8px;
            }
          `,
        }}
      />

      {/* ── HEADER + PO ── */}
      <div className="qt-sierra-card">
        <div className="qt-sierra-head">
          <div>
            <div className="qt-sierra-title">{brandLabel} Routing</div>
            <div className="qt-sierra-sub">
              Enter Original units and Final cases per DC. Cubic feet is derived from
              the SKU Master&apos;s <strong>case_cube_cuft</strong> field for each
              recognised product.
            </div>
          </div>
          <div className="qt-sierra-actions">
            <button type="button" className="qt-sierra-btn ghost" onClick={loadSkus}>
              ↻ Reload SKUs
            </button>
            <button type="button" className="qt-sierra-btn ghost" onClick={resetAll}>
              ✕ Reset
            </button>
            <button type="button" className="qt-sierra-btn accent" onClick={addLine}>
              + Add Line
            </button>
            <button
              type="button"
              className="qt-sierra-btn accent"
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
              title={
                canSubmit
                  ? "Save this PO to the shared list"
                  : "Set the PO number and enter at least one final-case value first"
              }
            >
              {submitting ? "Submitting…" : "✓ Submit"}
            </button>
          </div>
        </div>

        {skuLoadErr && (
          <div className="qt-sierra-warn" style={{ marginTop: 12 }}>
            ⚠ {skuLoadErr}
          </div>
        )}

        <div className="qt-sierra-poin">
          <label>PO Number</label>
          <input
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
            placeholder="e.g. R965946"
          />
        </div>
      </div>

      {/* ── MATRIX TABLE ── */}
      <div className="qt-sierra-card" style={{ padding: 0 }}>
        <div className="qt-sierra-tablewrap">
          <datalist id={`sku-datalist-sierra-${brand}`}>
            {skus.map((s) => (
              <option
                key={s.id}
                value={s.item_code}
                label={s.item_description ?? undefined}
              />
            ))}
          </datalist>

          <table className="qt-sierra-table">
            <thead>
              {/* Group header */}
              <tr>
                <th rowSpan={2} style={{ width: 36 }}>#</th>
                <th rowSpan={2}>Product</th>
                <th className="section-orig" colSpan={dcs.length + 2}>
                  Original (units)
                </th>
                <th className="section-final" colSpan={dcs.length + 2}>
                  Final (cases)
                </th>
                <th className="section-cuft" colSpan={dcs.length + 1}>
                  Cubic ft
                </th>
                <th rowSpan={2} style={{ width: 32 }}></th>
              </tr>
              <tr>
                {dcs.map((d) => (
                  <th key={`o-${d.num}`} className="section-orig">
                    {d.code}
                    <div style={{ fontSize: 9, color: "#aaa", fontWeight: 500 }}>
                      {d.num}
                    </div>
                  </th>
                ))}
                <th className="section-orig">Cases</th>
                <th className="section-orig">Units</th>
                {dcs.map((d) => (
                  <th key={`f-${d.num}`} className="section-final">
                    {d.code}
                    <div style={{ fontSize: 9, color: "#aaa", fontWeight: 500 }}>
                      {d.num}
                    </div>
                  </th>
                ))}
                <th className="section-final">Cases</th>
                <th className="section-final">Units</th>
                <th className="section-cuft">Cu ft / case</th>
                {dcs.map((d) => (
                  <th key={`c-${d.num}`} className="section-cuft">
                    Cu ft {d.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => {
                const c = computed[idx];
                return (
                  <tr key={line._id}>
                    <td style={{ color: "#888", fontWeight: 600, textAlign: "center" }}>
                      {idx + 1}
                    </td>
                    <td className="product-cell">
                      <input
                        className="product-input"
                        list={`sku-datalist-sierra-${brand}`}
                        value={line.product}
                        onChange={(e) =>
                          patchLine(line._id, {
                            product: e.target.value.toUpperCase(),
                          })
                        }
                        placeholder="QT15"
                        title={c.sku?.item_description ?? ""}
                      />
                    </td>
                    {/* Original per DC */}
                    {dcs.map((d) => {
                      const v = line.orig?.[d.num] ?? "";
                      return (
                        <td key={`o-${d.num}`} className="orig">
                          <input
                            type="number"
                            min={0}
                            value={v}
                            onChange={(e) =>
                              patchOrig(
                                line._id,
                                d.num,
                                e.target.value === ""
                                  ? ""
                                  : parseInt(e.target.value, 10) || 0,
                              )
                            }
                          />
                        </td>
                      );
                    })}
                    <td className="derived">
                      {fmtNum(c.origCasesTotal, 1) || "—"}
                    </td>
                    <td className="derived">{fmtInt(c.origUnitsTotal) || "—"}</td>
                    {/* Final per DC */}
                    {dcs.map((d) => {
                      const v = line.final?.[d.num] ?? "";
                      return (
                        <td key={`f-${d.num}`} className="final">
                          <input
                            type="number"
                            min={0}
                            value={v}
                            onChange={(e) =>
                              patchFinal(
                                line._id,
                                d.num,
                                e.target.value === ""
                                  ? ""
                                  : parseInt(e.target.value, 10) || 0,
                              )
                            }
                          />
                        </td>
                      );
                    })}
                    <td className="derived">{fmtInt(c.finalCasesTotal) || "—"}</td>
                    <td className="derived">{fmtInt(c.finalUnitsTotal) || "—"}</td>
                    {/* Cubic feet */}
                    <td className="cuft">
                      {c.cuftPerCase ? fmtNum(c.cuftPerCase, 2) : "—"}
                    </td>
                    {dcs.map((d) => (
                      <td key={`c-${d.num}`} className="cuft">
                        {fmtNum(c.cuFtPerDc[d.num] ?? 0, 2) || "—"}
                      </td>
                    ))}
                    <td style={{ textAlign: "center" }}>
                      <button
                        type="button"
                        className="qt-sierra-btn danger"
                        onClick={() => removeLine(line._id)}
                        title="Remove this row"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}

              {/* Grand totals */}
              <tr className="total-row">
                <td colSpan={2} style={{ textAlign: "right" }}>Total</td>
                {dcs.map((d) => (
                  <td key={`to-${d.num}`}>{fmtInt(totals.origPerDc[d.num]) || "—"}</td>
                ))}
                <td>{fmtNum(totals.origCases, 1) || "—"}</td>
                <td>{fmtInt(totals.origUnits) || "—"}</td>
                {dcs.map((d) => (
                  <td key={`tf-${d.num}`}>{fmtInt(totals.finalPerDc[d.num]) || "—"}</td>
                ))}
                <td>{fmtInt(totals.finalCases) || "—"}</td>
                <td>{fmtInt(totals.finalUnits) || "—"}</td>
                <td></td>
                {dcs.map((d) => (
                  <td key={`tc-${d.num}`}>{fmtNum(totals.cuftPerDc[d.num], 2) || "—"}</td>
                ))}
                <td></td>
              </tr>

              {/* total units — per-DC × 10 (matches Excel row 18: =C17*10). */}
              <tr className="summary-row">
                <td colSpan={2} style={{ textAlign: "right" }}>total units</td>
                {dcs.map((d) => (
                  <td key={`tu-o-${d.num}`}>
                    {fmtInt(summary.origTotalUnitsPerDc[d.num]) || "—"}
                  </td>
                ))}
                <td colSpan={2}></td>
                {dcs.map((d) => (
                  <td key={`tu-f-${d.num}`}>
                    {fmtInt(summary.finalTotalUnitsPerDc[d.num]) || "—"}
                  </td>
                ))}
                <td colSpan={2}></td>
                <td colSpan={dcs.length + 1}></td>
                <td></td>
              </tr>

              {/* WEIGHT — per-DC × 8 + base (90 for DC1, 120 for DC2).
                  Matches Excel row 19: =C17*8+90 / =D17*8+90+30. */}
              <tr className="summary-row">
                <td colSpan={2} style={{ textAlign: "right" }}>WEIGHT</td>
                {dcs.map((d) => (
                  <td key={`w-o-${d.num}`}>
                    {fmtInt(summary.origWeightPerDc[d.num]) || "—"}
                  </td>
                ))}
                <td colSpan={2}></td>
                {dcs.map((d) => (
                  <td key={`w-f-${d.num}`}>
                    {fmtInt(summary.finalWeightPerDc[d.num]) || "—"}
                  </td>
                ))}
                <td colSpan={2}></td>
                <td colSpan={dcs.length + 1}></td>
                <td></td>
              </tr>

              {/* PALLET — 1 per DC once that DC has data, otherwise blank. */}
              <tr className="summary-row">
                <td colSpan={2} style={{ textAlign: "right" }}>PALLET</td>
                {dcs.map((d) => (
                  <td key={`p-o-${d.num}`}>
                    {summary.origPalletPerDc[d.num] || "—"}
                  </td>
                ))}
                <td colSpan={2}></td>
                {dcs.map((d) => (
                  <td key={`p-f-${d.num}`}>
                    {summary.finalPalletPerDc[d.num] || "—"}
                  </td>
                ))}
                <td colSpan={2}></td>
                <td colSpan={dcs.length + 1}></td>
                <td></td>
              </tr>

              {/* WEIGHT ROUND UP — Math.ceil(WEIGHT). Matches Excel row 21
                  label (the customer fills this manually on the sheet;
                  here we surface the ceiling so it's there at a glance). */}
              <tr className="summary-row">
                <td colSpan={2} style={{ textAlign: "right" }}>WEIGHT ROUND UP</td>
                {dcs.map((d) => (
                  <td key={`wr-o-${d.num}`}>
                    {fmtInt(Math.ceil(summary.origWeightPerDc[d.num])) || "—"}
                  </td>
                ))}
                <td colSpan={2}></td>
                {dcs.map((d) => (
                  <td key={`wr-f-${d.num}`}>
                    {fmtInt(Math.ceil(summary.finalWeightPerDc[d.num])) || "—"}
                  </td>
                ))}
                <td colSpan={2}></td>
                <td colSpan={dcs.length + 1}></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SUBMIT — save this Sierra PO to the shared list ── */}
      <div className="qt-sierra-card">
        <div className="qt-sierra-title">Submit Routing</div>
        <div className="qt-sierra-sub" style={{ marginBottom: 14 }}>
          Save this {brandLabel} PO into the shared <strong>PO list</strong>.
          Once submitted, it&apos;ll appear on the <strong>History</strong> tab
          and be available on the <strong>Label Generator</strong> for printing
          carton labels.
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            className="qt-sierra-btn accent"
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            title={
              canSubmit
                ? "Save this PO to the shared list"
                : "Set the PO number and enter at least one final-case value first"
            }
            style={{ padding: "10px 22px", fontSize: 13 }}
          >
            {submitting ? "Submitting…" : "✓ Submit & Save to PO List"}
          </button>
          {!canSubmit && (
            <span style={{ fontSize: 12, color: "#a47712" }}>
              {!poNumber.trim()
                ? "Set the PO number above."
                : "Enter at least one final case count for a product / DC."}
            </span>
          )}
        </div>
        {submitMsg && (
          <div
            className="qt-sierra-warn"
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
