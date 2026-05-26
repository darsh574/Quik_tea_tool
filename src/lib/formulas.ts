// ─────────────────────────────────────────────────────────────────────────────
// QuikT Tool — calculation formulas ported VERBATIM from platform_updt.html.
// The pallet / weight / value math is the brand's own research — these
// functions must produce byte-identical numbers to the original tool.
// ─────────────────────────────────────────────────────────────────────────────

import { C23, C25, B23, B25, B27, B29, SKUS_20CT, SKU_WEIGHTS, SKU_PRICES } from "./constants";
import type {
  ShipmentState,
  QtyMap,
  LabelFormat,
  LabelElement,
  DC,
  DCSummary,
  SkuMasterRow,
  SummaryTotals,
  SummaryData,
} from "./types";
import { SPEC } from "./constants";

/**
 * Extract the trailing digit-group of a PO string.
 *   "50 631004" -> "631004"
 * Falls back to the whitespace-stripped value if no trailing group exists.
 */
export function poDigits(po: string): string {
  const stripped = String(po ?? "").replace(/\s+/g, "");
  const m = stripped.match(/(\d+)$/);
  return m ? m[1] : stripped;
}

/**
 * Recompute st.qtyFinal from st.qty + st.qtyFinalTotal.
 * Formula per cell: ROUND_TO_10-ish — ceil( (origDC / origRowTotal) × finalTotal )
 * with a floating-point guard.
 */
export function computeFinalQty(st: ShipmentState): QtyMap {
  const result: QtyMap = {};
  st.products.forEach((prod) => {
    result[prod] = {};
    const origRowTotal = st.dcs.reduce(
      (sum, dc) => sum + ((st.qty[prod] && st.qty[prod][dc.num]) || 0),
      0
    );
    const finalTotal =
      st.qtyFinalTotal && st.qtyFinalTotal[prod] != null
        ? st.qtyFinalTotal[prod]
        : origRowTotal;
    st.dcs.forEach((dc) => {
      const orig = (st.qty[prod] && st.qty[prod][dc.num]) || 0;
      if (origRowTotal === 0 || orig === 0) {
        result[prod][dc.num] = 0;
      } else {
        const raw = (orig / origRowTotal) * finalTotal;
        // floating-point fix: prevents 31.000000000000004 errors
        const rounded = Math.round(raw * 1e10) / 1e10;
        result[prod][dc.num] = Math.ceil(rounded);
      }
    });
  });
  return result;
}

/**
 * Compute the full Shipment Summary (per-DC rows + totals) from a brand state.
 * Mirrors getSummaryData() + computeAndBuild() from the original tool.
 */
export function computeSummary(st: ShipmentState): SummaryData | null {
  if (!st.products.length || !st.dcs.length) return null;

  const qty = st.qty;
  const dcData: DCSummary[] = st.dcs.map((dc) => {
    const cases20 = st.products
      .filter((p) => SKUS_20CT.includes(p))
      .reduce((sum, p) => sum + ((qty[p] && qty[p][dc.num]) || 0), 0);
    const units20 = cases20 * 10;
    const casesAll = st.products.reduce(
      (sum, p) => sum + ((qty[p] && qty[p][dc.num]) || 0),
      0
    );
    const cases10 = casesAll - cases20;
    const units10 = cases10 * 10;
    const totalCases = casesAll;

    let pallets = 0;
    if (totalCases > 0) {
      pallets = Math.ceil(((cases20 / C23) * B23 + (cases10 / C25) * B25) / B27);
      pallets = Math.max(1, pallets);
    }

    const netWt = st.products.reduce((sum, p) => {
      const cases = ((qty[p] && qty[p][dc.num]) || 0) * 10;
      const wt = (st.skuMeta && st.skuMeta[p] && st.skuMeta[p].weight) || SKU_WEIGHTS[p] || 0;
      return sum + wt * cases;
    }, 0);

    const palletWt = pallets * B29;
    const grossWt = netWt + palletWt;

    const value = st.products.reduce((sum, p) => {
      const cases = (qty[p] && qty[p][dc.num]) || 0;
      const price = (st.skuMeta && st.skuMeta[p] && st.skuMeta[p].price) || SKU_PRICES[p] || 0;
      return sum + price * cases * 10;
    }, 0);

    return { dc, units20, cases20, units10, cases10, totalCases, pallets, palletWt, netWt, grossWt, value };
  });

  const tot: SummaryTotals = {
    units20: 0, units10: 0, cases20: 0, cases10: 0, totalCases: 0,
    pallets: 0, palletWt: 0, netWt: 0, grossWt: 0, value: 0,
  };
  dcData.forEach((d) => {
    tot.units20 += d.units20;
    tot.units10 += d.units10;
    tot.cases20 += d.cases20;
    tot.cases10 += d.cases10;
    tot.totalCases += d.totalCases;
    tot.pallets += d.pallets;
    tot.palletWt += d.palletWt;
    tot.netWt += d.netWt;
    tot.grossWt += d.grossWt;
    tot.value += d.value;
  });

  return { dcData, tot, dcs: st.dcs };
}

/**
 * Build the ordered list of elements for one 6"×4" label.
 * Shared by the live preview and the PDF generator — identical layout.
 */
export function buildLabelElements(
  from: string,
  dc: DC,
  po: string,
  prod: string,
  q: number,
  cartonNum: number,
  f: LabelFormat
): LabelElement[] {
  const SP = SPEC;
  const x = SP.X;
  const xR = SP.X_RIGHT;
  const FN = SP.FS_NORM;
  const FC = SP.FS_CARTON;
  const els: LabelElement[] = [];
  let y = SP.Y_TOP;

  els.push({ text: `From: ${from}`, x, y, fs: FN, fw: "400" });
  y += SP.LG;
  els.push({ text: `To - ${dc.name} # ${dc.num}`, x, y, fs: FN, fw: "700" });
  y += SP.LG;
  if (dc.street) {
    els.push({ text: dc.street, x, y, fs: FN, fw: "400" });
    y += SP.LG;
  }
  if (dc.city) {
    els.push({ text: dc.city, x, y, fs: FN, fw: "400" });
  }

  const divY = y + SP.DIV_BELOW;
  els.push({ isDivider: true, y: divY });
  y = divY + SP.DIV_TO_PO;

  const poDigitsLocal = poDigits(po);
  const poLine = dc.poPrefix
    ? `PO # ${dc.poPrefix} ${poDigitsLocal}, ${f.dept}`
    : `PO # ${po}, ${f.dept}`;
  els.push({ text: poLine, x, y, fs: FN, fw: "700" });
  y += SP.LG;
  els.push({ text: `${f.vendorLabel} ${prod}`, x, y, fs: FN, fw: "700" });
  els.push({ text: `${f.unitsLabel} ${f.unitsVal}`, x: xR, y, fs: FN, fw: "700" });
  y += SP.LG;
  els.push({ text: `Stock Ready: ${f.stock}`, x, y, fs: FN, fw: "400" });
  els.push({ text: `Preticketed: ${f.pretick}`, x: xR, y, fs: FN, fw: "400" });
  y += SP.LG;
  els.push({ text: `Country of Origin: ${f.country}`, x, y, fs: FN, fw: "400" });

  const ct = `Carton #${cartonNum} of ${q}`;
  const approxW = ct.length * FC * 0.575;
  els.push({ text: ct, x: (SP.PW - approxW) / 2, y: SP.Y_CARTON, fs: FC, fw: "700", isCarton: true });

  return els;
}

/** Escape text for safe HTML insertion (live preview). */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Sierra Trading Post label — close to the HG / TJX / Marshalls template
 * but with three intentional differences (per the reference label PDF
 * `Sierra DC 0860 QT15 PO 0860R986505.pdf`):
 *
 *   1. To line:   `To: {name} #{dc.num}`     (colon, no space before #)
 *   2. PO line:   `PO # {dc.num}{po}`        (DC prepended, no Dept suffix)
 *   3. Address:   single-line "{street}, {city}"  (HG/TJX use two lines)
 *
 * The Vendor Style / Total Units / Stock Ready / Preticketed / Country of
 * Origin block remains identical to HG/TJX, driven by the same LabelFormat
 * fields the user already edits in the Label Generator.
 */
export function buildLabelElementsSierra(
  from: string,
  dc: DC,
  po: string,
  prod: string,
  q: number,
  cartonNum: number,
  f: LabelFormat,
): LabelElement[] {
  const SP = SPEC;
  const x = SP.X;
  const xR = SP.X_RIGHT;
  const FN = SP.FS_NORM;
  const FC = SP.FS_CARTON;
  const els: LabelElement[] = [];
  let y = SP.Y_TOP;

  els.push({ text: `From: ${from}`, x, y, fs: FN, fw: "400" });
  y += SP.LG;
  els.push({ text: `To: ${dc.name} #${dc.num}`, x, y, fs: FN, fw: "700" });
  y += SP.LG;

  const addressLine = [dc.street, dc.city]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(", ");
  if (addressLine) {
    els.push({ text: addressLine, x, y, fs: FN, fw: "400" });
  }

  const divY = y + SP.DIV_BELOW;
  els.push({ isDivider: true, y: divY });
  y = divY + SP.DIV_TO_PO;

  els.push({ text: `PO # ${dc.num}${po}`, x, y, fs: FN, fw: "700" });
  y += SP.LG;
  els.push({ text: `${f.vendorLabel} ${prod}`, x, y, fs: FN, fw: "700" });
  els.push({ text: `${f.unitsLabel} ${f.unitsVal}`, x: xR, y, fs: FN, fw: "700" });
  y += SP.LG;
  els.push({ text: `Stock Ready: ${f.stock}`, x, y, fs: FN, fw: "400" });
  els.push({ text: `Preticketed: ${f.pretick}`, x: xR, y, fs: FN, fw: "400" });
  y += SP.LG;
  els.push({ text: `Country of Origin: ${f.country}`, x, y, fs: FN, fw: "400" });

  const ct = `Carton #${cartonNum} of ${q}`;
  const approxW = ct.length * FC * 0.575;
  els.push({
    text: ct,
    x: (SP.PW - approxW) / 2,
    y: SP.Y_CARTON,
    fs: FC,
    fw: "700",
    isCarton: true,
  });

  return els;
}

/**
 * Word-wrap a string to a target character count per line. Used by the
 * DD Discount label preview where the product description can be longer
 * than the available label width. The PDF generator uses jsPDF's exact
 * measurement (`splitTextToSize`) instead; this is the preview approximation.
 */
function wrapTextByChars(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + " " + word).length <= maxChars) {
      current += " " + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * DD Discount label layout — distinct from the HG / TJX / Marshalls template.
 * Pulls extra metadata from the SKU Master (Vendor Style #, case pack, item
 * description, unit weight). Any field that's missing in the catalogue is
 * silently skipped, per the user's instruction ("skip them if not available").
 *
 * Reference: e:\Downloads\DDs PO 80778126 QT12.pdf
 *   From: Quikfoods Inc
 *   To: DD's Discount, East Coast DC
 *   1707 Shearer Drive, Carlisle, PA 17013
 *   ─────────
 *   PO # 80778126
 *   Vendor Style # 855664004990          (gtin_upc_case_code)
 *   10CT QUIKTEA CARDAMOM CHAI TEA LATTE (case_pack + item_description)
 *   Total Units per carton: 10           (case_pack)
 *   Unit Size: 8.47 oz, Color : None     (unit_net_wt_oz)
 *                Carton #N of M
 */
export function buildLabelElementsDdDiscount(
  from: string,
  dc: DC,
  po: string,
  qty: number,
  cartonNum: number,
  sku: SkuMasterRow | undefined,
): LabelElement[] {
  const SP = SPEC;
  const x = SP.X;
  const FN = SP.FS_NORM;
  const FC = SP.FS_CARTON;
  const els: LabelElement[] = [];
  let y = SP.Y_TOP;

  els.push({ text: `From: ${from}`, x, y, fs: FN, fw: "400" });
  y += SP.LG;
  els.push({ text: `To: ${dc.name}`, x, y, fs: FN, fw: "700" });
  y += SP.LG;

  // Single-line address — "{street}, {city}". Skip if both empty.
  const addressLine = [dc.street, dc.city]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(", ");
  if (addressLine) {
    els.push({ text: addressLine, x, y, fs: FN, fw: "400" });
  }

  const divY = y + SP.DIV_BELOW;
  els.push({ isDivider: true, y: divY });
  y = divY + SP.DIV_TO_PO;

  els.push({ text: `PO # ${po}`, x, y, fs: FN, fw: "700" });
  y += SP.LG;

  // Vendor Style # is the GTIN/UPC case code from the SKU master — not the
  // SKU `item_code` (QT12). Skip the line entirely if no GTIN is on file.
  if (sku?.gtin_upc_case_code) {
    els.push({
      text: `Vendor Style # ${sku.gtin_upc_case_code}`,
      x,
      y,
      fs: FN,
      fw: "700",
    });
    y += SP.LG;
  }

  // "{case_pack}CT {item_description}" — e.g. "10CT QUIKTEA CARDAMOM CHAI TEA LATTE"
  // Long descriptions wrap to a second line instead of getting "…" truncated.
  if (sku?.case_pack && sku?.item_description) {
    const productText = `${sku.case_pack}CT ${sku.item_description}`;
    // Word-wrap heuristic for 12pt Helvetica across the full label width
    // (~406pt usable → ~60 chars at the bold weight used here, allowing
    // some safety margin for wide glyphs).
    const wrapped = wrapTextByChars(productText, 60);
    for (const line of wrapped) {
      els.push({ text: line, x, y, fs: FN, fw: "700" });
      y += SP.LG;
    }
  }

  if (typeof sku?.case_pack === "number") {
    els.push({
      text: `Total Units per carton: ${sku.case_pack}`,
      x,
      y,
      fs: FN,
      fw: "700",
    });
    y += SP.LG;
  }

  if (typeof sku?.unit_net_wt_oz === "number") {
    els.push({
      text: `Unit Size: ${sku.unit_net_wt_oz} oz, Color : None`,
      x,
      y,
      fs: FN,
      fw: "400",
    });
  }

  const ct = `Carton #${cartonNum} of ${qty}`;
  const approxW = ct.length * FC * 0.575;
  els.push({
    text: ct,
    x: (SP.PW - approxW) / 2,
    y: SP.Y_CARTON,
    fs: FC,
    fw: "700",
    isCarton: true,
  });

  return els;
}
