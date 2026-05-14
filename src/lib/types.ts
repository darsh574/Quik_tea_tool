// ─────────────────────────────────────────────────────────────────────────────
// Shared domain types for the QuikT Tool.
// Shapes mirror the original platform_updt.html state exactly.
// ─────────────────────────────────────────────────────────────────────────────

export type BrandKey = "homegoods" | "tjx" | "marshalls";

/** A distribution center. `poPrefix` may be absent for manually-added DCs. */
export interface DC {
  num: string;
  code: string;
  poPrefix?: string;
  name: string;
  street: string;
  city: string;
}

/** Per-SKU metadata captured from the uploaded sheet (or the default fallback). */
export interface SkuMeta {
  price: number;
  weight: number;
}

/** qty[product][dcNum] = carton count (already ÷10 from the spreadsheet). */
export type QtyMap = Record<string, Record<string, number>>;

/** The complete per-brand shipment state — one of these exists per brand tab. */
export interface ShipmentState {
  products: string[];
  dcs: DC[];
  qty: QtyMap;
  qtyFinal: QtyMap;
  qtyFinalTotal: Record<string, number>;
  po: string;
  from: string;
  skuMeta: Record<string, SkuMeta>;
}

/** Label Format tab fields. */
export interface LabelFormat {
  dept: string;
  vendorLabel: string;
  unitsLabel: string;
  unitsVal: string;
  stock: string;
  pretick: string;
  country: string;
}

/** One element placed onto a 6"×4" label (used by preview + PDF). */
export interface LabelElement {
  text?: string;
  x?: number;
  y: number;
  fs?: number;
  fw?: string;
  isDivider?: boolean;
  isCarton?: boolean;
}

/** Per-DC computed shipment summary numbers. */
export interface DCSummary {
  dc: DC;
  units20: number;
  cases20: number;
  units10: number;
  cases10: number;
  totalCases: number;
  pallets: number;
  palletWt: number;
  netWt: number;
  grossWt: number;
  value: number;
}

export interface SummaryTotals {
  units20: number;
  units10: number;
  cases20: number;
  cases10: number;
  totalCases: number;
  pallets: number;
  palletWt: number;
  netWt: number;
  grossWt: number;
  value: number;
}

export interface SummaryData {
  dcData: DCSummary[];
  tot: SummaryTotals;
  dcs: DC[];
}

/** A single customer-order row in the BOL orders tables. */
export interface BolOrder {
  order: string;
  pkgs: number;
  weight: number;
  pallet: boolean;
  info: string;
  wms: string;
}

/** The full Bill of Lading form. Keys mirror the original input element ids. */
export interface BolForm {
  sf_name: string;
  sf_address: string;
  sf_csz: string;
  sf_sid: string;
  sf_fob: string;
  bol_number: string;
  load_id: string;
  bol_po_number: string;
  auth_num: string;
  freight_terms: string;
  st_name: string;
  st_location: string;
  st_address: string;
  st_csz: string;
  st_cid: string;
  st_fob: string;
  carrier_name: string;
  trailer_number: string;
  seal_number: string;
  scac: string;
  pro_number: string;
  appt_time: string;
  driver_arrival: string;
  driver_depart: string;
  tp_name: string;
  tp_address: string;
  tp_csz: string;
  hu_qty: string;
  hu_type: string;
  hu_pkg_qty: string;
  hu_pkg_type: string;
  hu_weight: string;
  commodity: string;
  nmfc: string;
  ltl_class: string;
  pallet_summary: string;
  cod_amount: string;
  hu_qty_p2: string;
  hu_type_p2: string;
  p1Orders: BolOrder[];
  p2Orders: BolOrder[];
}

/** A persisted PO record (Routing + Labels + BOL snapshot) stored in Supabase. */
export interface PoRecord {
  id?: string;
  po_number: string;
  po_digits?: string;
  brand: BrandKey;
  shipment_state: ShipmentState;
  label_format: LabelFormat;
  bol_form: BolForm;
  summary: SummaryData | null;
  label_total?: number;
  total_pallets?: number;
  bol_number?: string | null;
  created_at?: string;
  updated_at?: string;
  created_by?: string | null;
}
