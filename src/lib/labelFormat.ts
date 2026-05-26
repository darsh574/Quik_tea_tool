// ─────────────────────────────────────────────────────────────────────────────
// Default Label Format values — shared by the Zustand store (initial state +
// hydration migrations) and `saveSimplePoRecord` so Burlington / DD Discount
// saves never write an empty `label_format` that would later overwrite the
// live format on `loadRecord` and leave `f.vendorLabel` etc. undefined in the
// generated label (which rendered as the literal string "undefined QT15").
// ─────────────────────────────────────────────────────────────────────────────

import type { LabelFormat } from "./types";

export function defaultLabelFormat(): LabelFormat {
  return {
    dept: "Dept # 51",
    vendorLabel: "Vendor Style #",
    unitsLabel: "Total Units:",
    unitsVal: "10",
    stock: "No",
    pretick: "No",
    country: "India",
  };
}
