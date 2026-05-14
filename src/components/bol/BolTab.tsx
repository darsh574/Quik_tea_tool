"use client";

import { useState } from "react";
import { useShipmentStore } from "@/store/useShipmentStore";
import { computeSummary } from "@/lib/formulas";
import { CARRIER_BOOK } from "@/lib/constants";
import { buildBolPDF } from "@/lib/bolPdf";
import { syncBolFromSummary, updateShipperInfoPO } from "@/lib/bolHelpers";
import { savePoRecord } from "@/lib/history";
import { OrdersTable } from "@/components/bol/OrdersTable";
import type { BolForm } from "@/lib/types";

export default function BolTab() {
  const activeBrand = useShipmentStore((s) => s.activeBrand);
  const st = useShipmentStore((s) => s.brandState[s.activeBrand]);
  const format = useShipmentStore((s) => s.format);
  const bol = useShipmentStore((s) => s.bol);
  const setBol = useShipmentStore((s) => s.setBol);
  const setBolOrders = useShipmentStore((s) => s.setBolOrders);

  const [mode, setMode] = useState<"editable" | "static">("editable");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  function handleSync() {
    const summary = computeSummary(st);
    if (!summary) {
      flashToast("Add products and DCs on the Routing tab first.");
      return;
    }
    const patch = syncBolFromSummary(summary, activeBrand, bol.bol_po_number);
    setBol(patch);
    flashToast("Synced Handling QTY, Commodity & Customer Orders from the Shipment Summary.");
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
        await savePoRecord({ brand: activeBrand, shipmentState: st, format, bol });
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
      {/* ── Action bar ── */}
      <div className="card first">
        <div className="bol-action-bar">
          <div className="bol-title">Bill of Lading Generator — TJX Shipment Documents</div>
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
            <button className="bol-preview-btn" onClick={handleSync} title="Re-populate from the Shipment Summary">
              ↺ Sync from Summary
            </button>
            <button className="bol-preview-btn" onClick={handlePreview}>
              Preview
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
