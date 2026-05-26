"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useShipmentStore } from "@/store/useShipmentStore";
import { BRAND_CONFIG, SPEC } from "@/lib/constants";
import {
  buildLabelElements,
  buildLabelElementsDdDiscount,
  buildLabelElementsSierra,
} from "@/lib/formulas";
import { generateLabelZip, countLabelPdfs, downloadBlob } from "@/lib/labelPdf";
import { burlingtonToShipmentState } from "@/lib/burlingtonAdapter";
import { sierraToShipmentState } from "@/lib/sierraAdapter";
import { listSkuMaster } from "@/lib/skuMaster";
import PoPicker from "@/components/PoPicker";
import type { BrandKey, LabelFormat, SkuMasterRow } from "@/lib/types";

const FIELD_LABELS: { key: keyof LabelFormat; label: string; type?: "select" }[] = [
  { key: "dept", label: "Dept suffix" },
  { key: "vendorLabel", label: "Vendor Style label" },
  { key: "unitsLabel", label: "Total Units label" },
  { key: "unitsVal", label: "Total Units value" },
  { key: "stock", label: "Stock Ready", type: "select" },
  { key: "pretick", label: "Preticketed", type: "select" },
  { key: "country", label: "Country of Origin" },
];

/**
 * Brands that opt out of label generation entirely. (Burlington uses the
 * line-item routing flow but only needs a BOL, no shipping labels per spec.)
 */
const LABEL_DISABLED_BRANDS: BrandKey[] = ["burlington"];

/**
 * Brands that use the Burlington-style line-item routing and need their data
 * adapted into the standard ShipmentState shape before label generation.
 */
const ADAPTER_BRANDS: BrandKey[] = ["ddDiscount"];

/** Brands whose routing data lives in `sierra` and needs Sierra's adapter. */
const SIERRA_ADAPTER_BRANDS: BrandKey[] = ["sierra"];

export default function LabelsTab() {
  const activeBrand = useShipmentStore((s) => s.activeBrand);
  const st = useShipmentStore((s) => s.brandState[s.activeBrand]);
  const format = useShipmentStore((s) => s.format);
  const setFormat = useShipmentStore((s) => s.setFormat);
  const setActiveTab = useShipmentStore((s) => s.setActiveTab);

  const [progress, setProgress] = useState<{ pct: number; label: string } | null>(null);
  const [done, setDone] = useState(false);

  /**
   * `effectiveSt` is what the label pipeline reads. For HG / TJX / Marshalls
   * it's just `st` (no change to that flow). For DD Discount it's the
   * synthesised ShipmentState built from `st.burlington.lines`, so the
   * existing buildLabelElements / generateLabelZip stay unchanged.
   */
  const effectiveSt = useMemo(() => {
    if (ADAPTER_BRANDS.includes(activeBrand) && st.burlington) {
      return burlingtonToShipmentState(
        st.burlington,
        BRAND_CONFIG[activeBrand].defaultDCName,
        activeBrand,
      );
    }
    if (SIERRA_ADAPTER_BRANDS.includes(activeBrand) && st.sierra) {
      return sierraToShipmentState(st.sierra);
    }
    return st;
  }, [activeBrand, st]);

  const labelsDisabled = LABEL_DISABLED_BRANDS.includes(activeBrand);
  const useDdLayout = ADAPTER_BRANDS.includes(activeBrand);
  const useSierraLayout = SIERRA_ADAPTER_BRANDS.includes(activeBrand);

  // ── SKU Master lookup (only needed for DD Discount labels). ──
  const [skus, setSkus] = useState<SkuMasterRow[]>([]);
  const loadSkus = useCallback(async () => {
    try {
      setSkus(await listSkuMaster());
    } catch {
      setSkus([]);
    }
  }, []);
  useEffect(() => {
    if (useDdLayout) loadSkus();
  }, [useDdLayout, loadSkus]);
  const skuLookup = useMemo(() => {
    const m = new Map<string, SkuMasterRow>();
    skus.forEach((s) => m.set((s.item_code || "").toUpperCase().trim(), s));
    return m;
  }, [skus]);

  // ── Live preview — mirrors updatePreview() ──
  const previewEls = useMemo(() => {
    const dcMaster = BRAND_CONFIG[activeBrand].dcMaster;
    const firstMasterKey = Object.keys(dcMaster)[0];
    const dc =
      effectiveSt.dcs[0] ||
      (firstMasterKey
        ? { num: firstMasterKey, ...dcMaster[firstMasterKey] }
        : { num: "882", code: "TUC", name: "HomeGoods Distribution Center", street: "", city: "" });
    const prod = effectiveSt.products[0] || "QT15";
    const q =
      effectiveSt.qty[prod] && effectiveSt.qty[prod][dc.num]
        ? effectiveSt.qty[prod][dc.num]
        : 5;
    const from = effectiveSt.from || "Quikfoods Inc";
    if (useDdLayout) {
      // Reconstruct the full per-line PO for the preview: master + suffix.
      const fullPo = effectiveSt.po + (dc.poPrefix || dc.num);
      const sku = skuLookup.get(prod.toUpperCase().trim());
      return buildLabelElementsDdDiscount(from, dc, fullPo, q, 1, sku);
    }
    if (useSierraLayout) {
      return buildLabelElementsSierra(from, dc, effectiveSt.po, prod, q, 1, format);
    }
    return buildLabelElements(from, dc, effectiveSt.po, prod, q, 1, format);
  }, [activeBrand, effectiveSt, format, useDdLayout, useSierraLayout, skuLookup]);

  // ── Generate summary — mirrors updateSummary() ──
  const genSummary = useMemo(() => {
    let totalPdfs = 0;
    let totalPages = 0;
    const lines: string[] = [];
    effectiveSt.products.forEach((prod) => {
      let prodTotal = 0;
      effectiveSt.dcs.forEach((dc) => {
        const q =
          effectiveSt.qty[prod] && effectiveSt.qty[prod][dc.num]
            ? effectiveSt.qty[prod][dc.num]
            : 0;
        if (q > 0) {
          totalPdfs++;
          totalPages += q;
          prodTotal += q;
        }
      });
      if (prodTotal > 0) {
        const dcCount = effectiveSt.dcs.filter(
          (dc) => effectiveSt.qty[prod] && effectiveSt.qty[prod][dc.num] > 0,
        ).length;
        lines.push(`${prod} — ${dcCount} DC${dcCount !== 1 ? "s" : ""}, ${prodTotal} total labels`);
      }
    });
    return { totalPdfs, totalPages, lines };
  }, [effectiveSt]);

  async function handleGenerate() {
    setDone(false);
    const total = countLabelPdfs(effectiveSt);
    if (total === 0) {
      setProgress({ pct: 0, label: "No quantities entered yet — nothing to generate." });
      setTimeout(() => setProgress(null), 3000);
      return;
    }
    setProgress({ pct: 0, label: "Generating…" });
    const { blob, filename } = await generateLabelZip(
      activeBrand,
      effectiveSt,
      format,
      (d, t, pct) => {
        setProgress({ pct, label: `Generating… ${d} of ${t} PDFs (${pct}%)` });
      },
      // DD Discount labels pull Vendor Style # / case pack / item desc /
      // unit weight from the SKU Master; HG / TJX / Marshalls ignore this.
      useDdLayout ? skuLookup : undefined,
    );
    setProgress({ pct: 100, label: "Compressing ZIP…" });
    downloadBlob(blob, filename);
    setProgress(null);
    setDone(true);
    setTimeout(() => setDone(false), 5000);
  }

  const previewX = SPEC.X;

  // Burlington uses the BOL flow only — no shipping labels. Show a small
  // placeholder card instead of the full label editor / generator.
  if (labelsDisabled) {
    return (
      <>
        <PoPicker context="labels" />
        <div className="card first last">
          <div className="section-title">
            Label Generator — {BRAND_CONFIG[activeBrand].label}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            <strong>{BRAND_CONFIG[activeBrand].label}</strong> ships without
            carton labels — only the Bill of Lading is required. Head to the{" "}
            <button
              onClick={() => setActiveTab("bol")}
              style={{
                color: "#0e3a66",
                fontWeight: 700,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textDecoration: "underline",
                font: "inherit",
              }}
            >
              Bill of Lading
            </button>{" "}
            tab to generate the BOL for this PO.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <PoPicker context="labels" />

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
            <button
              onClick={() => setActiveTab("bol")}
              style={{
                color: "#1e7a4a",
                fontWeight: 700,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                textDecoration: "underline",
                font: "inherit",
              }}
            >
              Bill of Lading
            </button>{" "}
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
