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
  BurlingtonShipment,
  DC,
  QtyMap,
  ShipmentState,
} from "./types";

export function burlingtonToShipmentState(
  burlington: BurlingtonShipment,
  dcName: string,
): ShipmentState {
  const productSet = new Set<string>();
  const dcMap = new Map<string, DC>();
  const qty: QtyMap = {};

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
        street: "",
        city: "",
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
