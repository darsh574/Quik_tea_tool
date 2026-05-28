"use client";

import { useMemo, useRef, useState } from "react";
import { useShipmentStore } from "@/store/useShipmentStore";
import { parseShipmentSheet } from "@/lib/excel";
import { computeSummary } from "@/lib/formulas";
import { BRAND_CONFIG, ROUTING_READY_BRANDS } from "@/lib/constants";
import { savePoRecord } from "@/lib/history";
import { SummaryTable } from "@/components/SummaryTable";
import SimplePoRouting from "@/components/routing/SimplePoRouting";
import SierraRouting from "@/components/routing/SierraRouting";
import type { BrandKey } from "@/lib/types";

/** Brands that use the new line-item / Burlington-style routing format. */
const SIMPLE_PO_BRANDS: BrandKey[] = ["burlington", "ddDiscount"];
/** Brands that use the Sierra-style products-per-DC matrix. */
const SIERRA_BRANDS: BrandKey[] = ["sierra"];

// Tab order matches the dashboard reference: 3 new brands first, then the
// fully-wired HG / TJX / Marshalls.
const BRAND_TABS: BrandKey[] = [
  "burlington",
  "sierra",
  "ddDiscount",
  "homegoods",
  "tjx",
  "marshalls",
];

export default function RoutingTab() {
  const activeBrand = useShipmentStore((s) => s.activeBrand);
  const setActiveBrand = useShipmentStore((s) => s.setActiveBrand);
  const st = useShipmentStore((s) => s.brandState[s.activeBrand]);
  const setPO = useShipmentStore((s) => s.setPO);
  const setFrom = useShipmentStore((s) => s.setFrom);
  const addProduct = useShipmentStore((s) => s.addProduct);
  const removeProduct = useShipmentStore((s) => s.removeProduct);
  const addDC = useShipmentStore((s) => s.addDC);
  const removeDC = useShipmentStore((s) => s.removeDC);
  const setQty = useShipmentStore((s) => s.setQty);
  const loadParsedSheet = useShipmentStore((s) => s.loadParsedSheet);

  const format = useShipmentStore((s) => s.format);
  const bol = useShipmentStore((s) => s.bol);
  const bumpDataVersion = useShipmentStore((s) => s.bumpDataVersion);

  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [newProduct, setNewProduct] = useState("");
  const [newDC, setNewDC] = useState({ num: "", code: "", name: "", street: "", city: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const summary = useMemo(() => computeSummary(st), [st]);

  async function handleSubmitRouting() {
    setSubmitting(true);
    setSubmitMsg(null);
    try {
      const rec = await savePoRecord({
        brand: activeBrand,
        shipmentState: st,
        format,
        bol,
      });
      bumpDataVersion();
      setSubmitMsg({
        kind: "ok",
        msg: `✓ PO ${rec.po_number} saved to the PO list. It's now available in the Labels / BOL dropdowns.`,
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

  const canSubmit = !!st.po && st.products.length > 0 && st.dcs.length > 0;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setStatus({ kind: "ok", msg: "Reading file…" });
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseShipmentSheet(buf, activeBrand);
      loadParsedSheet({
        products: parsed.products,
        dcs: parsed.dcs,
        qty: parsed.qty,
        skuMeta: parsed.skuMeta,
        sheetPO: parsed.sheetPO,
      });
      const brandLabel = BRAND_CONFIG[activeBrand].label;
      const poWarning = !parsed.sheetPO
        ? " ⚠ PO number not found in sheet — enter it manually above."
        : "";
      setStatus({
        kind: "ok",
        msg: `✓ Imported into ${brandLabel} — ${parsed.products.length} products across ${parsed.dcs.length} DCs — ${parsed.totalLabels} total carton labels.${poWarning} Verify quantities in the table below.`,
      });
    } catch (err) {
      setStatus({ kind: "err", msg: "✗ " + (err instanceof Error ? err.message : "Failed to read the file.") });
    }
  }

  function submitProduct() {
    if (!newProduct.trim()) return;
    addProduct(newProduct);
    setNewProduct("");
  }

  function submitDC() {
    if (!newDC.num.trim() || !newDC.code.trim()) return;
    addDC({
      num: newDC.num.trim(),
      code: newDC.code.trim().toUpperCase(),
      name: newDC.name.trim(),
      street: newDC.street.trim(),
      city: newDC.city.trim(),
    });
    setNewDC({ num: "", code: "", name: "", street: "", city: "" });
  }

  const isReady = ROUTING_READY_BRANDS.includes(activeBrand);
  const isSimplePo = SIMPLE_PO_BRANDS.includes(activeBrand);
  const isSierra = SIERRA_BRANDS.includes(activeBrand);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .qt-brand-tabs {
          display: flex;
          gap: 6px;
          padding: 6px;
          background: #fff;
          border: 1px solid var(--top-border, #e6e0d4);
          border-radius: 12px;
          margin-bottom: 14px;
          overflow-x: auto;
        }
        .qt-brand-tab {
          flex: 1;
          min-width: 110px;
          padding: 9px 14px;
          background: transparent;
          border: none;
          border-radius: 8px;
          font-family: inherit;
          font-size: 12.5px;
          font-weight: 600;
          color: #5a6370;
          cursor: pointer;
          letter-spacing: 0.1px;
          transition: background 0.16s ease, color 0.16s ease;
          white-space: nowrap;
        }
        .qt-brand-tab:hover { background: #f6f3ec; color: #25303f; }
        .qt-brand-tab.active {
          background: #0e3a66;
          color: #fff;
          box-shadow: 0 2px 6px rgba(14,58,102,0.18);
        }
        .qt-brand-tab.pending { font-style: italic; opacity: 0.75; }
        .qt-brand-tab.pending::after {
          content: "soon";
          font-size: 9px;
          font-weight: 700;
          background: #fdf2dc;
          color: #a47712;
          padding: 2px 6px;
          border-radius: 999px;
          margin-left: 6px;
          letter-spacing: 0.4px;
          text-transform: uppercase;
          font-style: normal;
        }
        .qt-brand-tab.active.pending::after {
          background: rgba(255,255,255,0.18);
          color: #fff;
        }
        .qt-placeholder {
          background: #fff;
          border: 1px solid var(--top-border, #e6e0d4);
          border-radius: 14px;
          padding: 44px 36px;
          text-align: center;
        }
        .qt-placeholder-icon {
          width: 56px; height: 56px;
          border-radius: 14px;
          background: #fdf2dc;
          color: #a47712;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 14px;
        }
        .qt-placeholder h3 {
          font-family: Georgia, serif;
          font-size: 19px;
          font-weight: 700;
          color: #25303f;
          margin: 0 0 8px;
        }
        .qt-placeholder p {
          font-size: 13px;
          color: #6e6960;
          line-height: 1.55;
          max-width: 480px;
          margin: 0 auto;
        }
      ` }} />

      {/* ── BRAND TABS ── */}
      <div className="qt-brand-tabs" role="tablist">
        {BRAND_TABS.map((b) => {
          // A brand is "pending" only if NONE of the three routing flows
          // handle it (classic upload, simple-PO line items, or Sierra
          // matrix). Burlington / DD Discount / Sierra all now have their
          // own implementations, so the "soon" tag never shows for them.
          const hasRouting =
            ROUTING_READY_BRANDS.includes(b) ||
            SIMPLE_PO_BRANDS.includes(b) ||
            SIERRA_BRANDS.includes(b);
          return (
            <button
              key={b}
              role="tab"
              aria-selected={activeBrand === b}
              className={
                "qt-brand-tab" +
                (activeBrand === b ? " active" : "") +
                (hasRouting ? "" : " pending")
              }
              onClick={() => setActiveBrand(b)}
            >
              {BRAND_CONFIG[b].label}
            </button>
          );
        })}
      </div>

      {/* Burlington / DD Discount — line-item PO table with SKU Master lookups */}
      {isSimplePo && <SimplePoRouting brand={activeBrand} />}

      {/* Sierra — products × DC matrix with cubic-feet calculations */}
      {isSierra && <SierraRouting brand={activeBrand} />}

      {!isReady && !isSimplePo && !isSierra && (
        <div className="qt-placeholder">
          <div className="qt-placeholder-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h3>{BRAND_CONFIG[activeBrand].label} routing — coming soon</h3>
          <p>
            DC list and quantity rules for <strong>{BRAND_CONFIG[activeBrand].label}</strong> haven&apos;t
            been wired up yet. Switch to <strong>HomeGoods</strong>, <strong>T.J. Maxx</strong>, or{" "}
            <strong>Marshalls</strong> above to use the existing routing flow, or share the DC master
            and we&apos;ll add this brand next.
          </p>
        </div>
      )}

      {isReady && (
      <>
      {/* ── UPLOAD ── */}
      <div className="card first">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 6,
          }}
        >
          <div className="section-title" style={{ marginBottom: 0 }}>
            Import from Excel / CSV
          </div>
          <button
            className="btn-generate"
            onClick={handleSubmitRouting}
            disabled={submitting || !canSubmit}
            title={
              canSubmit
                ? "Save this PO to the shared list"
                : "Set a PO, add at least one product and one DC first"
            }
            style={{ padding: "8px 16px", fontSize: 12 }}
          >
            {submitting ? "Submitting…" : "✓ Submit & Save to PO List"}
          </button>
        </div>
        <p className="hint" style={{ marginBottom: 12 }}>
          Upload the Quikfoods shipment CSV or Excel for the active brand tab. All quantities are{" "}
          <strong>automatically ÷ 10</strong> (the spreadsheet stores ×10 of the actual carton count).
        </p>
        <div
          className={"upload-zone" + (dragOver ? " drag-over" : "")}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFile(e.dataTransfer.files[0]);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <div className="upload-icon">📂</div>
          <div className="upload-text">
            <strong>Click to upload or drag &amp; drop</strong>
            <span>Supports .xlsx, .xls, .csv · Quikfoods shipment sheet format</span>
          </div>
        </div>
        {status && <div className={"upload-status " + status.kind}>{status.msg}</div>}
      </div>

      {/* ── SHIPMENT INFO ── */}
      <div className="card">
        <div className="section-title">Shipment Info</div>
        <div className="row2">
          <div className="field">
            <label>PO Number</label>
            <input value={st.po} onChange={(e) => setPO(e.target.value)} />
          </div>
          <div className="field">
            <label>From (Sender Name)</label>
            <input value={st.from} onChange={(e) => setFrom(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── PRODUCTS ── */}
      <div className="card">
        <div className="section-title">Products</div>
        <div className="tags-wrap">
          {st.products.map((p) => (
            <div className="tag" key={p}>
              <span>{p}</span>
              <button onClick={() => removeProduct(p)}>✕</button>
            </div>
          ))}
          {st.products.length === 0 && (
            <span className="hint">No products yet — upload a sheet or add manually.</span>
          )}
        </div>
        <div className="add-inline">
          <input
            placeholder="e.g. QT12"
            maxLength={20}
            value={newProduct}
            onChange={(e) => setNewProduct(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitProduct()}
          />
          <button className="btn-sm" onClick={submitProduct}>
            + Add Product
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          Auto-filled from upload. Press Enter or click Add to add manually.
        </p>
      </div>

      {/* ── DISTRIBUTION CENTERS ── */}
      <div className="card">
        <div className="section-title">Distribution Centers</div>
        <p className="hint" style={{ marginBottom: 10 }}>
          Auto-filled from upload. Addresses pulled from the master lookup automatically.
        </p>
        <div className="tags-wrap">
          {st.dcs.map((dc) => (
            <div className="tag" key={dc.num}>
              <span>
                {dc.num} <span style={{ color: "#aaa", fontWeight: 400 }}>{dc.code}</span>
                <span
                  style={{ fontSize: 10, color: "#bbb", fontWeight: 400, display: "block" }}
                >
                  {dc.street}
                  {dc.city ? ", " + dc.city : ""}
                </span>
              </span>
              <button onClick={() => removeDC(dc.num)}>✕</button>
            </div>
          ))}
          {st.dcs.length === 0 && <span className="hint">No DCs yet.</span>}
        </div>
        <div className="add-inline" style={{ flexWrap: "wrap", gap: 8 }}>
          <input
            placeholder="DC # e.g. 882"
            style={{ width: 100 }}
            value={newDC.num}
            onChange={(e) => setNewDC({ ...newDC, num: e.target.value })}
          />
          <input
            placeholder="Code e.g. TUC"
            style={{ width: 90 }}
            value={newDC.code}
            onChange={(e) => setNewDC({ ...newDC, code: e.target.value })}
          />
          <input
            placeholder="DC Name"
            style={{ width: 220 }}
            value={newDC.name}
            onChange={(e) => setNewDC({ ...newDC, name: e.target.value })}
          />
          <input
            placeholder="Street address"
            style={{ width: 220 }}
            value={newDC.street}
            onChange={(e) => setNewDC({ ...newDC, street: e.target.value })}
          />
          <input
            placeholder="City, State Zip"
            style={{ width: 180 }}
            value={newDC.city}
            onChange={(e) => setNewDC({ ...newDC, city: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && submitDC()}
          />
          <button className="btn-sm" onClick={submitDC}>
            + Add DC
          </button>
        </div>
      </div>

      {/* ── QUANTITIES ── */}
      <div className="card">
        <div className="section-title">
          Quantities
          <span
            style={{
              fontWeight: 400,
              textTransform: "none",
              letterSpacing: 0,
              fontSize: 11,
              color: "#bbb",
            }}
          >
            (actual carton count — already ÷10 when imported from Excel)
          </span>
        </div>
        <div className="table-wrap">
          {!st.products.length || !st.dcs.length ? (
            <div className="empty-state">
              Add products and DCs above to see the quantity table.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  {st.dcs.map((dc) => (
                    <th key={dc.num}>
                      {dc.num}
                      <span className="dc-sub">{dc.code}</span>
                    </th>
                  ))}
                  <th style={{ background: "#2a2a2a" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {st.products.map((prod) => {
                  let rowTotal = 0;
                  const cells = st.dcs.map((dc) => {
                    const v =
                      st.qty[prod] && st.qty[prod][dc.num] !== undefined
                        ? st.qty[prod][dc.num]
                        : 0;
                    rowTotal += v;
                    return (
                      <td key={dc.num}>
                        <input
                          type="number"
                          min={0}
                          max={9999}
                          value={v}
                          onChange={(e) =>
                            setQty(prod, dc.num, parseInt(e.target.value) || 0)
                          }
                        />
                      </td>
                    );
                  });
                  return (
                    <tr key={prod}>
                      <td>{prod}</td>
                      {cells}
                      <td style={{ fontWeight: 700, color: "#1a1a1a" }}>{rowTotal}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── SHIPMENT SUMMARY ── */}
      <div className="card">
        <div className="section-title">Shipment Summary</div>
        <div className="table-wrap">
          {summary ? (
            <SummaryTable summary={summary} />
          ) : (
            <div className="empty-state">
              Add products and DCs above to see the shipment summary.
            </div>
          )}
        </div>
      </div>

      {/* ── SUBMIT — save the routing snapshot into the PO list ── */}
      <div className="card last">
        <div className="section-title">Submit Routing</div>
        <p className="hint" style={{ marginBottom: 14 }}>
          Save this PO into the shared <strong>PO list</strong>. Once submitted, it&apos;ll show up
          in the <strong>Label Generator</strong> and <strong>Bill of Lading</strong> tabs&apos;
          PO dropdowns so anyone on the team can pick it up.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="btn-generate"
            onClick={handleSubmitRouting}
            disabled={submitting || !canSubmit}
            title={
              canSubmit
                ? "Save this PO to the shared list"
                : "Set a PO, add at least one product and one DC first"
            }
          >
            {submitting ? "Submitting…" : "✓ Submit & Save to PO List"}
          </button>
          {!canSubmit && (
            <span style={{ fontSize: 12, color: "#a47712" }}>
              {!st.po
                ? "Set a PO number above."
                : st.products.length === 0
                ? "Add at least one product."
                : "Add at least one DC."}
            </span>
          )}
        </div>
        {submitMsg && (
          <div className={"upload-status " + submitMsg.kind} style={{ marginTop: 12 }}>
            {submitMsg.msg}
          </div>
        )}
      </div>
      </>
      )}
    </>
  );
}
