// ─────────────────────────────────────────────────────────────────────────────
// Label PDF + ZIP generation — ported VERBATIM from platform_updt.html.
// One 6"×4" landscape PDF per product×DC combo; nested into a ZIP:
//   ZIP → {poDigits} folder → {dcNum} subfolders → PDF files
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from "jspdf";
import JSZip from "jszip";
import { SPEC, BRAND_CONFIG } from "./constants";
import { poDigits } from "./formulas";
import type { BrandKey, ShipmentState, LabelFormat } from "./types";

/** Truncate text with an ellipsis so it never overflows maxW (jsPDF measure). */
function safeText(doc: jsPDF, text: string, x: number, y: number, maxW?: number): void {
  if (!maxW) {
    doc.text(text, x, y);
    return;
  }
  let t = text;
  while (t.length > 1 && doc.getTextWidth(t) > maxW) t = t.slice(0, -1);
  if (t !== text) {
    t += "…";
    while (t.length > 1 && doc.getTextWidth(t) > maxW) t = t.slice(0, -2) + "…";
  }
  doc.text(t, x, y);
}

/** Count how many PDFs (product×DC combos with qty > 0) will be produced. */
export function countLabelPdfs(st: ShipmentState): number {
  let totalPdfs = 0;
  st.products.forEach((prod) =>
    st.dcs.forEach((dc) => {
      if ((st.qty[prod] && st.qty[prod][dc.num]) || 0) totalPdfs++;
    })
  );
  return totalPdfs;
}

export interface LabelZipResult {
  blob: Blob;
  filename: string;
}

/**
 * Generate the full label ZIP for a brand state + label format.
 * `onProgress(done, total, pct)` is called after each PDF is added.
 */
export async function generateLabelZip(
  activeBrand: BrandKey,
  st: ShipmentState,
  f: LabelFormat,
  onProgress?: (done: number, total: number, pct: number) => void
): Promise<LabelZipResult> {
  const po = (st.po || "").trim() || "PO";
  const from = (st.from || "").trim() || "Quikfoods Inc";
  const pdfPrefix = BRAND_CONFIG[activeBrand].pdfPrefix;

  // Extract trailing digits from PO: "50 631004" → "631004"
  const poDigitsLocal = poDigits(po);

  const zip = new JSZip();
  const poFolder = zip.folder(poDigitsLocal)!;

  const totalPdfs = countLabelPdfs(st);

  let done = 0;
  const SP = SPEC;
  const PW = SP.PW;
  const PH = SP.PH;

  for (const prod of st.products) {
    for (const dc of st.dcs) {
      const q = (st.qty[prod] && st.qty[prod][dc.num]) ? st.qty[prod][dc.num] : 0;
      if (!q) continue;

      const dcFolder = poFolder.folder(dc.num)!;

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [PW, PH] });

      for (let i = 1; i <= q; i++) {
        if (i > 1) doc.addPage([PW, PH], "landscape");

        const x = SP.X;
        const xR = SP.X_RIGHT;
        let y = SP.Y_TOP;

        doc.setFont(SP.FONT, "normal");
        doc.setFontSize(SP.FS_NORM);

        safeText(doc, `From: ${from}`, x, y, SP.FULL_MAX_W);
        y += SP.LG;

        doc.setFont(SP.FONT, "bold");
        safeText(doc, `To - ${dc.name} # ${dc.num}`, x, y, SP.FULL_MAX_W);
        y += SP.LG;

        doc.setFont(SP.FONT, "normal");
        if (dc.street) {
          safeText(doc, dc.street, x, y, SP.FULL_MAX_W);
          y += SP.LG;
        }
        if (dc.city) {
          safeText(doc, dc.city, x, y, SP.FULL_MAX_W);
        }

        const divY = y + SP.DIV_BELOW;
        doc.setDrawColor(150, 150, 150);
        doc.setLineWidth(0.5);
        doc.line(x, divY, PW - x, divY);
        y = divY + SP.DIV_TO_PO;

        doc.setFont(SP.FONT, "bold");
        const dcPoLine = dc.poPrefix
          ? `PO # ${dc.poPrefix} ${poDigitsLocal}, ${f.dept}`
          : `PO # ${po}, ${f.dept}`;
        safeText(doc, dcPoLine, x, y, SP.FULL_MAX_W);
        y += SP.LG;
        safeText(doc, `${f.vendorLabel} ${prod}`, x, y, SP.LEFT_MAX_W);
        safeText(doc, `${f.unitsLabel} ${f.unitsVal}`, xR, y, SP.RIGHT_MAX_W);
        y += SP.LG;

        doc.setFont(SP.FONT, "normal");
        safeText(doc, `Stock Ready: ${f.stock}`, x, y, SP.LEFT_MAX_W);
        safeText(doc, `Preticketed: ${f.pretick}`, xR, y, SP.RIGHT_MAX_W);
        y += SP.LG;
        safeText(doc, `Country of Origin: ${f.country}`, x, y, SP.FULL_MAX_W);

        doc.setFont(SP.FONT, "bold");
        doc.setFontSize(SP.FS_CARTON);
        const carton = `Carton #${i} of ${q}`;
        const cw = doc.getTextWidth(carton);
        doc.text(carton, (PW - cw) / 2, SP.Y_CARTON);
      }

      // PDF naming: HG_TUC_DC882_QT12_PO_631004_Labels_6x4.pdf
      const pdfName = `${pdfPrefix}_${dc.code}_DC${dc.num}_${prod}_PO_${poDigitsLocal}_Labels_6x4.pdf`;
      dcFolder.file(pdfName, doc.output("arraybuffer"));
      done++;
      const pct = totalPdfs ? Math.round((done / totalPdfs) * 100) : 100;
      onProgress?.(done, totalPdfs, pct);
      // yield to the event loop so the progress bar can paint
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  return { blob, filename: `${poDigitsLocal}.zip` };
}

/** Trigger a browser download of a Blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
