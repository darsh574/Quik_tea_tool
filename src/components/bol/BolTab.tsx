"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useShipmentStore } from "@/store/useShipmentStore";
import { computeSummary } from "@/lib/formulas";
import { CARRIER_BOOK } from "@/lib/constants";
import { buildBolPDF } from "@/lib/bolPdf";
import {
  syncBolFromSummary,
  syncBolFromBurlington,
  updateShipperInfoPO,
} from "@/lib/bolHelpers";
import { savePoRecord, saveSimplePoRecord } from "@/lib/history";
import { OrdersTable } from "@/components/bol/OrdersTable";
import PoPicker from "@/components/PoPicker";
import type { BolForm, BrandKey } from "@/lib/types";

/** Brands that use the line-item (Burlington / DD Discount) routing flow. */
const SIMPLE_PO_BRANDS: BrandKey[] = ["burlington", "ddDiscount"];

export default function BolTab() {
  const activeBrand = useShipmentStore((s) => s.activeBrand);
  const st = useShipmentStore((s) => s.brandState[s.activeBrand]);
  const format = useShipmentStore((s) => s.format);
  const bol = useShipmentStore((s) => s.bol);
  const setBol = useShipmentStore((s) => s.setBol);
  const setBolOrders = useShipmentStore((s) => s.setBolOrders);
  const bumpDataVersion = useShipmentStore((s) => s.bumpDataVersion);

  const [mode, setMode] = useState<"editable" | "static">("editable");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Auto-save state ──
  // The user explicitly enables auto-save by clicking "Sync from Summary".
  // After that, edits to the BOL form are persisted to Supabase with a 1.5s
  // debounce so we don't hammer the database on every keystroke.
  const [autoSaveOn, setAutoSaveOn] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Skip auto-save on the very first render after enabling (Sync already wrote)
  const skipNextAutoSave = useRef(false);

  useEffect(() => {
    if (!autoSaveOn) return;
    if (skipNextAutoSave.current) {
      skipNextAutoSave.current = false;
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveStatus("saving");
    autoSaveTimer.current = setTimeout(async () => {
      try {
        if (SIMPLE_PO_BRANDS.includes(activeBrand) && st.burlington) {
          await saveSimplePoRecord({
            brand: activeBrand,
            burlington: st.burlington,
            totals: {
              finalQty: burlingtonTotals?.finalQty ?? 0,
              weight: burlingtonTotals?.weight ?? 0,
              cu: 0,
              pallets: burlingtonTotals?.pallets ?? 0,
            },
            bol,
          });
        } else {
          await savePoRecord({ brand: activeBrand, shipmentState: st, format, bol });
        }
        setLastSavedAt(new Date());
        setAutoSaveStatus("saved");
        bumpDataVersion();
      } catch {
        // Silent for auto-save — the badge flips to "error" but we don't
        // interrupt the user. They can still hit Save / Generate manually.
        setAutoSaveStatus("error");
      }
    }, 1500);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bol, autoSaveOn]);

  // bound text input bound to a BolForm key
  function B({ k, ...rest }: { k: keyof BolForm } & React.InputHTMLAttributes<HTMLInputElement>) {
    return (
      <input
        type="text"
        value={(bol[k] as string) ?? ""}
        onChange={(e) => setBol({ [k]: e.target.value })}
        {...rest}
      />
    );
  }

  function flashToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  function selectCarrier(idx: string) {
    if (idx === "") return;
    const c = CARRIER_BOOK[parseInt(idx)];
    if (!c) return;
    setBol({ carrier_name: c.carrier, st_name: c.name, st_address: c.street, st_csz: c.csz });
  }

  function onPoChange(value: string) {
    setBol({
      bol_po_number: value,
      p1Orders: updateShipperInfoPO(bol.p1Orders, value),
      p2Orders: updateShipperInfoPO(bol.p2Orders, value),
    });
  }

  /** Compute Burlington totals (mirrors the SimplePoRouting math). */
  const burlingtonTotals = useMemo(() => {
    const b = st.burlington;
    if (!b) return null;
    const { palletConstants, lines } = b;
    let final = 0,
      sumWeight = 0,
      sumLayers = 0,
      sumHeight = 0;
    // NOTE: weight/cu ft per line need SKU master lookups, which BolTab doesn't
    // load. The user's confirmed mappings are PO + pallets + total cartons.
    // Total weight is computed from `finalQty × case_gross_wt_lb` — we don't
    // have that here, so we fall back to (pallet wt × pallets) only when SKU
    // weights aren't known. The Submit on the Routing tab persists the full
    // totals to Supabase; this is just for an in-progress preview.
    lines.forEach((l) => {
      const f = typeof l.finalQty === "number" ? l.finalQty : 0;
      const hi = typeof l.hi === "number" ? l.hi : 0;
      final += f;
      sumLayers += hi > 0 ? f / hi : 0;
      sumHeight += 0; // unknown without SKU master
    });
    const maxH = palletConstants.maxHeight;
    const pallets = maxH > 0 && sumHeight > 0 ? (sumLayers * sumHeight) / maxH : 0;
    const weight = sumWeight + palletConstants.wt * pallets;
    return { finalQty: final, weight, pallets };
  }, [st]);

  async function handleSync() {
    // ── Burlington / DD Discount: pull from the line-item routing snapshot.
    if (SIMPLE_PO_BRANDS.includes(activeBrand)) {
      const b = st.burlington;
      if (!b || b.headerPo.trim() === "") {
        flashToast("Fill the Burlington routing (header PO + at least one line) first.");
        return;
      }
      const patch = syncBolFromBurlington(b, burlingtonTotals ?? { finalQty: 0, weight: 0, pallets: 0 });
      setBol(patch);
      skipNextAutoSave.current = true;
      setAutoSaveOn(true);
      setAutoSaveStatus("saving");
      try {
        await saveSimplePoRecord({
          brand: activeBrand,
          burlington: b,
          totals: {
            finalQty: burlingtonTotals?.finalQty ?? 0,
            weight: burlingtonTotals?.weight ?? 0,
            cu: 0,
            pallets: burlingtonTotals?.pallets ?? 0,
          },
          bol: { ...bol, ...patch },
        });
        setLastSavedAt(new Date());
        setAutoSaveStatus("saved");
        bumpDataVersion();
        flashToast("Synced from Burlington routing · auto-save is now ON.");
      } catch (err) {
        setAutoSaveStatus("error");
        flashToast(
          "Synced — but save failed: " +
            (err instanceof Error ? err.message : "unknown error") +
            ". Auto-save still on; will retry on next edit.",
        );
      }
      return;
    }

    // ── HG / TJX / Marshalls: existing per-DC summary flow.
    const summary = computeSummary(st);
    if (!summary) {
      flashToast("Add products and DCs on the Routing tab first.");
      return;
    }
    const patch = syncBolFromSummary(summary, activeBrand, bol.bol_po_number);
    setBol(patch);
    // Persist the synced state immediately, then enable auto-save for future edits.
    skipNextAutoSave.current = true;
    setAutoSaveOn(true);
    setAutoSaveStatus("saving");
    try {
      await savePoRecord({
        brand: activeBrand,
        shipmentState: st,
        format,
        bol: { ...bol, ...patch },
      });
      setLastSavedAt(new Date());
      setAutoSaveStatus("saved");
      bumpDataVersion();
      flashToast("Synced from Summary · auto-save is now ON.");
    } catch (err) {
      setAutoSaveStatus("error");
      flashToast(
        "Synced — but save failed: " +
          (err instanceof Error ? err.message : "unknown error") +
          ". Auto-save still on; will retry on next edit.",
      );
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const rec =
        SIMPLE_PO_BRANDS.includes(activeBrand) && st.burlington
          ? await saveSimplePoRecord({
              brand: activeBrand,
              burlington: st.burlington,
              totals: {
                finalQty: burlingtonTotals?.finalQty ?? 0,
                weight: burlingtonTotals?.weight ?? 0,
                cu: 0,
                pallets: burlingtonTotals?.pallets ?? 0,
              },
              bol,
            })
          : await savePoRecord({ brand: activeBrand, shipmentState: st, format, bol });
      setLastSavedAt(new Date());
      setAutoSaveStatus("saved");
      bumpDataVersion();
      flashToast(`✓ Saved BOL for PO ${rec.po_number}.`);
    } catch (err) {
      flashToast("Save failed: " + (err instanceof Error ? err.message : "unknown error"));
    } finally {
      setSubmitting(false);
    }
  }

  function handlePreview() {
    const doc = buildBolPDF(bol, mode === "editable");
    const blob = doc.output("blob");
    setPreviewUrl(URL.createObjectURL(blob));
  }

  async function handleGenerate() {
    setSaving(true);
    try {
      const doc = buildBolPDF(bol, mode === "editable");
      doc.save("TJX_BOL_" + (bol.bol_number || "draft") + ".pdf");
      // Save the full shipment snapshot to history, keyed by PO.
      try {
        if (SIMPLE_PO_BRANDS.includes(activeBrand) && st.burlington) {
          await saveSimplePoRecord({
            brand: activeBrand,
            burlington: st.burlington,
            totals: {
              finalQty: burlingtonTotals?.finalQty ?? 0,
              weight: burlingtonTotals?.weight ?? 0,
              cu: 0,
              pallets: burlingtonTotals?.pallets ?? 0,
            },
            bol,
          });
        } else {
          await savePoRecord({ brand: activeBrand, shipmentState: st, format, bol });
        }
        bumpDataVersion();
        flashToast("BOL generated and shipment saved to history.");
      } catch (err) {
        flashToast(
          "BOL generated — but history save failed: " +
            (err instanceof Error ? err.message : "unknown error")
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bol-panel">
      <PoPicker context="bol" />

      {/* ── Action bar ── */}
      <div className="card first">
        <div className="bol-action-bar">
          <div>
            <div className="bol-title">Bill of Lading Generator — TJX Shipment Documents</div>
            <AutoSaveBadge state={autoSaveStatus} on={autoSaveOn} lastSavedAt={lastSavedAt} />
          </div>
          <div className="bol-buttons">
            <div className="bol-mode-toggle">
              <button
                className={mode === "editable" ? "active" : ""}
                onClick={() => setMode("editable")}
              >
                Editable PDF
              </button>
              <button
                className={mode === "static" ? "active" : ""}
                onClick={() => setMode("static")}
              >
                Non-Editable PDF
              </button>
            </div>
            <button className="bol-preview-btn" onClick={handleSync} title="Re-populate from the Shipment Summary and enable auto-save">
              ↺ Sync from Summary
            </button>
            <button className="bol-preview-btn" onClick={handlePreview}>
              Preview
            </button>
            <button
              className="bol-preview-btn"
              onClick={handleSubmit}
              disabled={submitting}
              title="Save the BOL to the PO list without generating the PDF"
            >
              {submitting ? "Saving…" : "💾 Submit"}
            </button>
            <button className="bol-generate-btn" onClick={handleGenerate} disabled={saving}>
              {saving ? "Saving…" : "Generate PDF & Save"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: "16px 0 24px" }}>
        {/* ── Ship From + BOL Info ── */}
        <div className="grid2">
          <div className="section">
            <div className="section-header">Ship From</div>
            <div className="section-body">
              <div className="form-row">
                <div className="form-group full">
                  <label>Name</label>
                  <B k="sf_name" />
                </div>
                <div className="form-group full">
                  <label>Address</label>
                  <B k="sf_address" />
                </div>
                <div className="form-group full">
                  <label>City / State / Zip</label>
                  <B k="sf_csz" />
                </div>
                <div className="form-group">
                  <label>SID #</label>
                  <B k="sf_sid" />
                </div>
                <div className="form-group">
                  <label>FOB</label>
                  <B k="sf_fob" />
                </div>
              </div>
            </div>
          </div>
          <div className="section">
            <div className="section-header">Bill of Lading Info</div>
            <div className="section-body">
              <div className="form-row">
                <div className="form-group">
                  <label>BOL Number</label>
                  <B k="bol_number" />
                </div>
                <div className="form-group">
                  <label>Load ID #</label>
                  <B k="load_id" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Shipment PO # (used in Shipper Info)</label>
                  <input
                    type="text"
                    value={bol.bol_po_number}
                    placeholder="e.g. 062715"
                    onChange={(e) => onPoChange(e.target.value)}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Authorization #</label>
                  <B k="auth_num" />
                </div>
                <div className="form-group">
                  <label>Freight Charge Terms</label>
                  <select
                    value={bol.freight_terms}
                    onChange={(e) => setBol({ freight_terms: e.target.value })}
                  >
                    <option value="Collect">Collect</option>
                    <option value="Prepaid">Prepaid</option>
                    <option value="3rd Party">3rd Party</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Ship To + Carrier ── */}
        <div className="grid2">
          <div className="section">
            <div className="section-header">Ship To</div>
            <div className="section-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <B k="st_name" />
                </div>
                <div className="form-group">
                  <label>Location #</label>
                  <B k="st_location" />
                </div>
                <div className="form-group full">
                  <label>Address</label>
                  <B k="st_address" />
                </div>
                <div className="form-group full">
                  <label>City / State / Zip</label>
                  <B k="st_csz" />
                </div>
                <div className="form-group">
                  <label>CID #</label>
                  <B k="st_cid" />
                </div>
                <div className="form-group">
                  <label>FOB</label>
                  <B k="st_fob" />
                </div>
              </div>
            </div>
          </div>
          <div className="section">
            <div className="section-header">Carrier</div>
            <div className="section-body">
              <div className="form-row">
                <div className="form-group full">
                  <label>Carrier Name</label>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <B k="carrier_name" style={{ flex: 1, minWidth: 0 }} />
                    <select
                      onChange={(e) => selectCarrier(e.target.value)}
                      defaultValue=""
                      style={{ flex: 1, minWidth: 0 }}
                    >
                      <option value="">— Address Book —</option>
                      {CARRIER_BOOK.map((c, i) => (
                        <option key={i} value={i}>
                          {c.carrier} · {c.csz.split(",")[0]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Trailer Number</label>
                  <B k="trailer_number" />
                </div>
                <div className="form-group">
                  <label>Seal Number</label>
                  <B k="seal_number" />
                </div>
                <div className="form-group">
                  <label>SCAC</label>
                  <B k="scac" />
                </div>
                <div className="form-group">
                  <label>Pro Number</label>
                  <B k="pro_number" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Appointment / Driver Times ── */}
        <div className="section">
          <div className="section-header">Appointment / Driver Times</div>
          <div className="section-body">
            <div className="form-row">
              <div className="form-group">
                <label>Appointment Time</label>
                <B k="appt_time" placeholder="e.g. 12:00" />
              </div>
              <div className="form-group">
                <label>Actual Driver Arrival</label>
                <B k="driver_arrival" placeholder="e.g. 12:00" />
              </div>
              <div className="form-group">
                <label>Driver Departure</label>
                <B k="driver_depart" placeholder="e.g. 12:00" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Third Party Freight ── */}
        <div className="section">
          <div className="section-header">Third Party Freight Charges Bill To</div>
          <div className="section-body">
            <div className="form-row">
              <div className="form-group">
                <label>Name</label>
                <B k="tp_name" />
              </div>
              <div className="form-group">
                <label>Address</label>
                <B k="tp_address" />
              </div>
              <div className="form-group">
                <label>City / State / Zip</label>
                <B k="tp_csz" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Carrier Information ── */}
        <div className="section">
          <div className="section-header">Carrier Information</div>
          <div className="section-body">
            <div className="form-row">
              <div className="form-group">
                <label>Handling Unit QTY</label>
                <input
                  type="number"
                  value={bol.hu_qty}
                  onChange={(e) => setBol({ hu_qty: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Handling Unit Type</label>
                <B k="hu_type" />
              </div>
              <div className="form-group">
                <label>Package QTY</label>
                <input
                  type="number"
                  value={bol.hu_pkg_qty}
                  onChange={(e) => setBol({ hu_pkg_qty: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Package Type</label>
                <B k="hu_pkg_type" />
              </div>
              <div className="form-group">
                <label>Weight</label>
                <input
                  type="number"
                  value={bol.hu_weight}
                  onChange={(e) => setBol({ hu_weight: e.target.value })}
                />
              </div>
              <div className="form-group full">
                <label>Commodity Description</label>
                <B k="commodity" />
              </div>
              <div className="form-group">
                <label>NMFC #</label>
                <B k="nmfc" />
              </div>
              <div className="form-group">
                <label>Class</label>
                <B k="ltl_class" />
              </div>
              <div className="form-group full">
                <label>Pallet Summary (row 2 commodity line)</label>
                <B k="pallet_summary" placeholder="Total Pallets summary…" />
              </div>
            </div>
            <p className="hint">
              Row 1 = main handling/commodity data · Row 2 = pallet summary. Use “Sync from
              Summary” to auto-fill Handling QTY and Commodity from the Routing totals.
            </p>
          </div>
        </div>

        {/* ── Fee Terms ── */}
        <div className="section">
          <div className="section-header">Fee Terms</div>
          <div className="section-body">
            <div className="form-row">
              <div className="form-group">
                <label>COD Amount ($)</label>
                <B k="cod_amount" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Page 1 Orders ── */}
        <div className="section">
          <div className="section-header">
            Page 1 — Customer Orders
            <span className="page-indicator">All orders appear on page 1</span>
          </div>
          <div className="section-body">
            <OrdersTable
              orders={bol.p1Orders}
              onChange={(orders) => setBolOrders("p1Orders", orders)}
            />
          </div>
        </div>

        {/* ── Page 2 Orders ── */}
        <div className="section">
          <div className="section-header">
            Page 2 — Extra Page Orders
            <span className="page-indicator">Separate page in PDF</span>
          </div>
          <div className="section-body">
            <OrdersTable
              orders={bol.p2Orders}
              onChange={(orders) => setBolOrders("p2Orders", orders)}
            />
            <div style={{ marginTop: 12 }}>
              <div className="form-row">
                <div className="form-group">
                  <label>Page 2 Handling QTY</label>
                  <input
                    type="number"
                    value={bol.hu_qty_p2}
                    onChange={(e) => setBol({ hu_qty_p2: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Page 2 Handling Type</label>
                  <B k="hu_type_p2" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Preview Modal ── */}
      <div className={"modal-overlay" + (previewUrl ? " open" : "")}>
        <div className="modal">
          <div className="modal-header">
            <h3>PDF Preview</h3>
            <button
              className="modal-close"
              onClick={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewUrl(null);
              }}
            >
              Close
            </button>
          </div>
          <div className="modal-body">{previewUrl && <iframe src={previewUrl} />}</div>
        </div>
      </div>

      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}

function AutoSaveBadge({
  state,
  on,
  lastSavedAt,
}: {
  state: "idle" | "saving" | "saved" | "error";
  on: boolean;
  lastSavedAt: Date | null;
}) {
  if (!on) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginTop: 4,
          fontSize: 11,
          color: "#888",
          letterSpacing: 0.2,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "#cfcabf",
            display: "inline-block",
          }}
        />
        Auto-save off — click <strong style={{ marginLeft: 3 }}>Sync from Summary</strong> to enable
      </div>
    );
  }

  const color =
    state === "saved"
      ? "#1e7a4a"
      : state === "saving"
      ? "#a47712"
      : state === "error"
      ? "#c94628"
      : "#5a6370";
  const bg =
    state === "saved"
      ? "#e8f6ee"
      : state === "saving"
      ? "#fdf2dc"
      : state === "error"
      ? "#fdece6"
      : "#f0ede6";
  const label =
    state === "saving"
      ? "Saving…"
      : state === "saved"
      ? lastSavedAt
        ? `Auto-saved · ${lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "Auto-saved"
      : state === "error"
      ? "Auto-save error · will retry"
      : "Auto-save on";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        marginTop: 4,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        color,
        background: bg,
        padding: "3px 10px",
        borderRadius: 999,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: color,
          display: "inline-block",
          animation: state === "saving" ? "qt-pulse-dot 1s ease-in-out infinite" : "none",
        }}
      />
      {label}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes qt-pulse-dot {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.4; transform: scale(0.7); }
            }
          `,
        }}
      />
    </div>
  );
}
