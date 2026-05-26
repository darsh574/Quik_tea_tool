// ─────────────────────────────────────────────────────────────────────────────
// Burlington / DD Discount → standard ShipmentState adapter.
//
// The line-item flow stores data as `burlington.lines[]` (product · suffix ·
// finalQty). The label PDF generator + preview were written against the HG /
// TJX / Marshalls shape (products[] × dcs[] × qty[product][dc]).
//
// Rather than duplicate the label code path, we synthesise a ShipmentState
// from the line items so the existing buildLabelElements / generateLabelZip
// keep working unchanged. Each unique suffix becomes a synthetic DC; the
// suffix is also written into `poPrefix` so the label PO line renders as
// "PO # {suffix} {master}, Dept # ..." — matching the format used for HG /
// TJX / Marshalls labels.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  BrandKey,
  BurlingtonShipment,
  DC,
  QtyMap,
  ShipmentState,
} from "./types";

/**
 * Brand-specific defaults for the synthetic DC built from a Burlington-style
 * line item. For DD Discount, we use the East Coast DC address from the
 * reference label PDF (1707 Shearer Drive, Carlisle, PA 17013) so the
 * generated labels show real ship-to info. Multiple-DC support can be
 * layered on later by mapping suffix → DC details if/when needed.
 */
const DC_DEFAULTS: Partial<Record<BrandKey, { name: string; street: string; city: string }>> = {
  ddDiscount: {
    name: "DD's Discount, East Coast DC",
    street: "1707 Shearer Drive",
    city: "Carlisle, PA 17013",
  },
};

export function burlingtonToShipmentState(
  burlington: BurlingtonShipment,
  fallbackDcName: string,
  brand?: BrandKey,
): ShipmentState {
  const productSet = new Set<string>();
  const dcMap = new Map<string, DC>();
  const qty: QtyMap = {};
  const dcDefaults = brand ? DC_DEFAULTS[brand] : undefined;
  const dcName = dcDefaults?.name ?? fallbackDcName;
  const dcStreet = dcDefaults?.street ?? "";
  const dcCity = dcDefaults?.city ?? "";

  burlington.lines.forEach((l) => {
    const product = (l.product || "").trim().toUpperCase();
    // suffix is the DC number — fall back to the legacy `po.slice(-2)` for
    // records saved before the dedicated `suffix` field existed.
    const suffix = (
      l.suffix ?? (l.po ? l.po.slice(-2) : "")
    ).trim();
    const final = typeof l.finalQty === "number" ? l.finalQty : 0;
    if (!product || !suffix || final <= 0) return;

    productSet.add(product);
    if (!dcMap.has(suffix)) {
      dcMap.set(suffix, {
        num: suffix,
        code: suffix,
        name: dcName,
        street: dcStreet,
        city: dcCity,
        poPrefix: suffix,
      });
    }
    if (!qty[product]) qty[product] = {};
    qty[product][suffix] = (qty[product][suffix] || 0) + final;
  });

  return {
    products: Array.from(productSet),
    dcs: Array.from(dcMap.values()),
    qty,
    qtyFinal: {},
    qtyFinalTotal: {},
    po: burlington.headerPo,
    from: "Quikfoods Inc",
    skuMeta: {},
  };
}
