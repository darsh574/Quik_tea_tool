"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useShipmentStore } from "@/store/useShipmentStore";
import { BRAND_CONFIG, SPEC } from "@/lib/constants";
import { buildLabelElements } from "@/lib/formulas";
import { generateLabelZip, countLabelPdfs, downloadBlob } from "@/lib/labelPdf";
import type { LabelFormat } from "@/lib/types";

const FIELD_LABELS: { key: keyof LabelFormat; label: string; type?: "select" }[] = [
  { key: "dept", label: "Dept suffix" },
  { key: "vendorLabel", label: "Vendor Style label" },
  { key: "unitsLabel", label: "Total Units label" },
  { key: "unitsVal", label: "Total Units value" },
  { key: "stock", label: "Stock Ready", type: "select" },
  { key: "pretick", label: "Preticketed", type: "select" },
  { key: "country", label: "Country of Origin" },
];

export default function LabelsTab() {
  const activeBrand = useShipmentStore((s) => s.activeBrand);
  const st = useShipmentStore((s) => s.brandState[s.activeBrand]);
  const format = useShipmentStore((s) => s.format);
  const setFormat = useShipmentStore((s) => s.setFormat);

  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null);
  const [done, setDone] = useState(false);

  // ── Live preview — mirrors updatePreview() ──
  const previewEls = useMemo(() => {
    const dcMaster = BRAND_CONFIG[activeBrand].dcMaster;
    const firstMasterKey = Object.keys(dcMaster)[0];
    const dc =
      st.dcs[0] ||
      (firstMasterKey
        ? { num: firstMasterKey, ...dcMaster[firstMasterKey] }
        : { num: "882", code: "TUC", name: "HomeGoods Distribution Center", street: "", city: "" });
    const prod = st.products[0] || "QT15";
    const q = st.qty[prod] && st.qty[prod][dc.num] ? st.qty[prod][dc.num] : 5;
    const from = st.from || "Quikfoods Inc";
    return buildLabelElements(from, dc, st.po, prod, q, 1, format);
  }, [activeBrand, st, format]);

  // ── Generate summary — mirrors updateSummary() ──
  const genSummary = useMemo(() => {
    let totalPdfs = 0;
    let totalPages = 0;
    const lines: string[] = [];
    st.products.forEach((prod) => {
      let prodTotal = 0;
      st.dcs.forEach((dc) => {
        const q = st.qty[prod] && st.qty[prod][dc.num] ? st.qty[prod][dc.num] : 0;
        if (q > 0) {
          totalPdfs++;
          totalPages += q;
          prodTotal += q;
        }
      });
      if (prodTotal > 0) {
        const dcCount = st.dcs.filter((dc) => st.qty[prod] && st.qty[prod][dc.num] > 0).length;
        lines.push(`${prod} — ${dcCount} DC${dcCount !== 1 ? "s" : ""}, ${prodTotal} total labels`);
      }
    });
    return { totalPdfs, totalPages, lines };
  }, [st]);

  async function handleGenerate() {
    setDone(false);
    const total = countLabelPdfs(st);
    if (total === 0) {
      setProgress({ pct: 0, label: "No quantities entered yet — nothing to generate." });
      setTimeout(() => setProgress(null), 3000);
      return;
    }
    setProgress({ pct: 0, label: "Generating…" });
    const { blob, filename } = await generateLabelZip(activeBrand, st, format, (d, t, pct) => {
      setProgress({ pct, label: `Generating… ${d} of ${t} PDFs (${pct}%)` });
    });
    setProgress({ pct: 100, label: "Compressing ZIP…" });
    downloadBlob(blob, filename);
    setProgress(null);
    setDone(true);
    setTimeout(() => setDone(false), 5000);
  }

  const previewX = SPEC.X;

  return (
    <>
      {/* ── LABEL FORMAT ── */}
      <div className="card first">
        <div className="section-title">Label Content</div>
        <div className="editor-layout">
          <div className="label-fields">
            {FIELD_LABELS.map((f) => (
              <div className="label-field-row" key={f.key}>
                <label>{f.label}</label>
                {f.type === "select" ? (
                  <select
                    value={format[f.key]}
                    onChange={(e) => setFormat({ [f.key]: e.target.value })}
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                ) : (
                  <input
                    value={format[f.key]}
                    onChange={(e) => setFormat({ [f.key]: e.target.value })}
                  />
                )}
              </div>
            ))}
            <div style={{ marginTop: 10, paddingTop: 12, borderTop: "1px solid #f0f0f0" }}>
              <p className="spec-note">
                <strong>Fixed layout:</strong> Helvetica 12pt · Page 6&quot;×4&quot; · Left margin
                0.25&quot; · Right col 2.60&quot; · Carton # 26pt bold centered at 72% down the page
              </p>
            </div>
          </div>
          <div className="preview-outer">
            <div className="preview-title">Live Preview — matches PDF layout</div>
            <div className="preview-box">
              {previewEls.map((el, i) => {
                if (el.isDivider) {
                  return (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        left: previewX,
                        right: previewX,
                        top: el.y,
                        height: 0.75,
                        background: "#999",
                      }}
                    />
                  );
                }
                const top = el.y - (el.fs || 12);
                return (
                  <div
                    key={i}
                    className="pline"
                    style={{
                      left: el.x,
                      top,
                      fontSize: el.fs,
                      fontWeight: el.fw as React.CSSProperties["fontWeight"],
                    }}
                  >
                    {el.text}
                  </div>
                );
              })}
            </div>
            <div className="preview-ratio">6&quot; × 4&quot; · fixed production layout</div>
          </div>
        </div>
      </div>

      {/* ── GENERATE ── */}
      <div className="card last">
        <div className="section-title">Generate Labels</div>
        <div style={{ fontSize: 13, color: "#555", lineHeight: 1.9, marginBottom: 20 }}>
          <strong>Brand:</strong> {BRAND_CONFIG[activeBrand].label}
          <br />
          <strong>PO:</strong> {st.po || "—"}
          <br />
          {genSummary.lines.length ? (
            genSummary.lines.map((l, i) => (
              <span key={i}>
                {l}
                <br />
              </span>
            ))
          ) : (
            <span style={{ color: "#bbb" }}>No quantities entered yet.</span>
          )}
          <br />
          <strong>
            {genSummary.totalPdfs} PDF{genSummary.totalPdfs !== 1 ? "s" : ""}
          </strong>{" "}
          ·{" "}
          <strong>
            {genSummary.totalPages} total label page{genSummary.totalPages !== 1 ? "s" : ""}
          </strong>
        </div>

        <button className="btn-generate" onClick={handleGenerate} disabled={!!progress}>
          Generate ZIP &amp; Download
        </button>

        {progress && (
          <div className="progress-wrap active">
            <div className="progress-bar-bg">
              <div className="progress-bar" style={{ width: progress.pct + "%" }} />
            </div>
            <div className="progress-label">{progress.label}</div>
          </div>
        )}

        {done && (
          <div className="success-msg active">
            ✓ ZIP downloaded — check your Downloads folder. Next: head to the{" "}
            <Link href="/dashboard/bol" style={{ color: "#1e7a4a", fontWeight: 700 }}>
              Bill of Lading
            </Link>{" "}
            tab.
          </div>
        )}

        <p className="hint" style={{ marginTop: 14 }}>
          PDFs are nested by folder: ZIP → PO folder → DC subfolders → one PDF per product×DC.
          The full shipment is saved to history when you generate the BOL.
        </p>
      </div>
    </>
  );
}
