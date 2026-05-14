"use client";

import { useMemo, useRef, useState } from "react";
import { useShipmentStore } from "@/store/useShipmentStore";
import { parseShipmentSheet } from "@/lib/excel";
import { computeSummary } from "@/lib/formulas";
import { BRAND_CONFIG } from "@/lib/constants";
import { SummaryTable } from "@/components/SummaryTable";

export default function RoutingTab() {
  const activeBrand = useShipmentStore((s) => s.activeBrand);
  const st = useShipmentStore((s) => s.brandState[s.activeBrand]);
  const setPO = useShipmentStore((s) => s.setPO);
  const setFrom = useShipmentStore((s) => s.setFrom);
  const addProduct = useShipmentStore((s) => s.addProduct);
  const removeProduct = useShipmentStore((s) => s.removeProduct);
  const addDC = useShipmentStore((s) => s.addDC);
  const removeDC = useShipmentStore((s) => s.removeDC);
  const setQty = useShipmentStore((s) => s.setQty);
  const loadParsedSheet = useShipmentStore((s) => s.loadParsedSheet);

  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [newProduct, setNewProduct] = useState("");
  const [newDC, setNewDC] = useState({ num: "", code: "", name: "", street: "", city: "" });

  const summary = useMemo(() => computeSummary(st), [st]);

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

  return (
    <>
      {/* ── UPLOAD ── */}
      <div className="card first">
        <div className="section-title">Import from Excel / CSV</div>
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
      <div className="card last">
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
    </>
  );
}
