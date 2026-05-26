// ─────────────────────────────────────────────────────────────────────────────
// Sierra Trading Post → standard ShipmentState adapter.
//
// SierraShipment stores data as `sierra.dcs[]` + `sierra.lines[]` with a
// per-(product, dc) `final` count (cases). The label PDF generator was
// written against the HG / TJX / Marshalls shape (products × dcs × qty).
//
// This adapter synthesises a ShipmentState from the Sierra matrix so the
// existing label pipeline keeps working unchanged. Each (product, dc) cell
// with `final > 0` becomes one entry in the qty map; that's the number of
// carton labels that will be printed for that combo.
// ─────────────────────────────────────────────────────────────────────────────

import type { DC, QtyMap, ShipmentState, SierraShipment } from "./types";

const DEFAULT_SIERRA_DC_NAME = "Sierra Distribution Center";

export function sierraToShipmentState(
  sierra: SierraShipment,
): ShipmentState {
  const productSet = new Set<string>();
  const dcMap = new Map<string, DC>();
  const qty: QtyMap = {};

  const lines = Array.isArray(sierra.lines) ? sierra.lines : [];
  const dcs = Array.isArray(sierra.dcs) ? sierra.dcs : [];

  lines.forEach((l) => {
    const product = (l.product || "").trim().toUpperCase();
    if (!product) return;

    dcs.forEach((d) => {
      const final =
        typeof l.final?.[d.num] === "number" ? (l.final[d.num] as number) : 0;
      if (final <= 0) return;

      productSet.add(product);
      if (!dcMap.has(d.num)) {
        dcMap.set(d.num, {
          num: d.num,
          code: d.code,
          name: d.name || DEFAULT_SIERRA_DC_NAME,
          street: d.street || "",
          city: d.city || "",
        });
      }
      if (!qty[product]) qty[product] = {};
      qty[product][d.num] = (qty[product][d.num] || 0) + final;
    });
  });

  return {
    products: Array.from(productSet),
    dcs: Array.from(dcMap.values()),
    qty,
    qtyFinal: {},
    qtyFinalTotal: {},
    po: sierra.poNumber || "",
    from: "Quikfoods Inc",
    skuMeta: {},
  };
}
