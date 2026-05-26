// ─────────────────────────────────────────────────────────────────────────────
// QuikT Tool — constants ported VERBATIM from platform_updt.html.
// Do not "tidy" these numbers — they are the result of the brand's own
// research and Excel formulas. Every value here must match the original.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  BrandKey,
  DC,
  ShipmentState,
  BolOrder,
  BurlingtonShipment,
  BurlingtonLine,
  SierraDc,
  SierraLine,
  SierraShipment,
} from "./types";

/** Sierra Trading Post default DCs — from the customer's `siara routing.xlsx`.
 *  Addresses match the reference label PDF for 0860; 0810 keeps a placeholder
 *  city/state until the customer supplies the full address. */
export const SIERRA_DCS: SierraDc[] = [
  {
    num: "0810",
    code: "CHE",
    state: "WY",
    name: "Sierra Distribution Center",
    street: "",
    city: "Cheyenne, WY",
  },
  {
    num: "0860",
    code: "ASH",
    state: "OH",
    name: "Sierra Distribution Center",
    street: "4077 Airbase Road",
    city: "Ashville, OH 43103",
  },
];

/** Fresh blank Sierra line — empty per-DC orig/final maps populated by the
 *  component on first render. */
export function newSierraLine(product = ""): SierraLine {
  return {
    _id: Math.random().toString(36).slice(2),
    product,
    orig: {},
    final: {},
  };
}

/**
 * Default Sierra product list — these are the SKUs Sierra Trading Post
 * orders. Pre-filled per the customer's `siara routing.xlsx` reference.
 */
export const SIERRA_DEFAULT_PRODUCTS = [
  "QT15", "QT75", "QT55", "QT13", "QT16", "QT54", "QT37",
];

export function defaultSierraShipment(): SierraShipment {
  return {
    poNumber: "",
    dcs: SIERRA_DCS.map((d) => ({ ...d })),
    lines: SIERRA_DEFAULT_PRODUCTS.map((p) => newSierraLine(p)),
  };
}

/** Per-DC weight base (lb) used by the Sierra weight formula:
 *  weight = per_dc_total × 8 + base. From the customer's worksheet:
 *  DC1 base = 90, DC2 base = 120 (90 + 30). */
export const SIERRA_WEIGHT_PER_UNIT = 8;
export const SIERRA_WEIGHT_BASES = [90, 120];

/** Fresh blank line item for the Burlington / DD Discount routing table. */
export function newBurlingtonLine(): BurlingtonLine {
  return {
    _id: Math.random().toString(36).slice(2),
    suffix: "",
    product: "",
    origQty: "",
    finalQty: "",
    hi: "",
  };
}

/**
 * Fresh Burlington / DD Discount routing snapshot. Used by both the store's
 * `makeDefaultBrandState` initialiser and the SimplePoRouting reset action.
 * Pallet constants default to the values from the customer's reference sheet.
 */
export function defaultBurlingtonShipment(): BurlingtonShipment {
  return {
    headerPo: "",
    startDate: "",
    endDate: "",
    lines: Array.from({ length: 7 }, newBurlingtonLine),
    palletConstants: { cuFt: 6.7, wt: 80, maxHeight: 72 },
  };
}

// ── SPEC — 6"×4" landscape label, pixel-matched to the reference image ──
export const SPEC = {
  PW: 6 * 72,
  PH: 4 * 72,
  FS_NORM: 12,
  FS_CARTON: 26,
  FONT: "helvetica",
  LG: 0.222 * 72,
  X: 0.25 * 72,
  Y_TOP: 0.285 * 72,
  X_RIGHT: 2.6 * 72,
  DIV_BELOW: 0.09 * 72,
  DIV_TO_PO: 0.22 * 72,
  Y_CARTON: 0.72 * 288,
  get LEFT_MAX_W() {
    return (2.55 - 0.25 - 0.04) * 72;
  },
  get RIGHT_MAX_W() {
    return (6 - 2.6 - 0.1) * 72;
  },
  get FULL_MAX_W() {
    return (6 - 0.25 - 0.1) * 72;
  },
};

// ── MASTER DC LOOKUPS ──
export const DC_MASTER: Record<string, Omit<DC, "num">> = {
  "882": { code: "TUC", poPrefix: "20", name: "HomeGoods Distribution Center", street: "6803 South Palo Verde Rd", city: "Tucson, AZ 85756" },
  "883": { code: "CAR", poPrefix: "30", name: "HomeGoods Distribution Center", street: "4200 Industrial Blvd", city: "Carrollton, TX 75007" },
  "884": { code: "JEF", poPrefix: "40", name: "HomeGoods Distribution Center", street: "1150 Jefferson Way", city: "Jefferson, OH 44047" },
  "885": { code: "BLM", poPrefix: "50", name: "HomeGoods Distribution Center", street: "900 Commerce Dr", city: "Bloomington, IL 61701" },
  "886": { code: "LRD", poPrefix: "60", name: "HomeGoods Distribution Center", street: "2200 Freight Ave", city: "Laredo, TX 78040" },
  "887": { code: "IND", poPrefix: "70", name: "HomeGoods Distribution Center", street: "5400 Meridian St", city: "Indianapolis, IN 46204" },
  "890": { code: "FTW", poPrefix: "90", name: "HomeGoods Distribution Center", street: "8201 Oak Grove Road", city: "Fort Worth, TX 76140" },
};

export const DC_MASTER_TJX: Record<string, Omit<DC, "num">> = {
  "891": { code: "SAN", poPrefix: "10", name: "T.J. Maxx Distribution Center", street: "11650 FM 1937", city: "San Antonio, TX 78221" },
  "894": { code: "CHA", poPrefix: "40", name: "T.J. Maxx Distribution Center", street: "14300 Carowinds Blvd.", city: "Charlotte, NC 28273" },
  "896": { code: "WOR", poPrefix: "60", name: "T.J. Maxx Distribution Center", street: "135 Goddard Memorial Dr", city: "Worcester, MA 01603" },
  "897": { code: "EVN", poPrefix: "70", name: "T.J. Maxx Distribution Center", street: "3301 Maxx Road", city: "Evansville, IN 47711" },
  "898": { code: "TLV", poPrefix: "80", name: "T.J. Maxx Distribution Center", street: "4100 Eastlone Mountain Rd", city: "North Las Vegas, NV 89081" },
};

export const DC_MASTER_MARSHALLS: Record<string, Omit<DC, "num">> = {
  "881": { code: "AZR", poPrefix: "01", name: "Marshalls Distribution Center", street: "3000 S. 55th Avenue", city: "Phoenix, AZ 85043" },
  "884": { code: "ELP", poPrefix: "04", name: "Marshalls Distribution Center", street: "3900 Global Reach Dr", city: "El Paso, TX 79925" },
  "886": { code: "BRI", poPrefix: "06", name: "Marshalls Distribution Center", street: "701 N. Main Street", city: "Bridgewater, VA 22812" },
  "887": { code: "ATL", poPrefix: "07", name: "Marshalls Distribution Center", street: "2300 Miller Road", city: "Decatur, GA 30035" },
  "888": { code: "WOB", poPrefix: "08", name: "Marshalls Distribution Center", street: "83 Commerce Way", city: "Woburn, MA 01801" },
};

// Brand config: maps brand key to its DC master, PDF prefix, and default DC name
export interface BrandConfigEntry {
  dcMaster: Record<string, Omit<DC, "num">>;
  pdfPrefix: string;
  defaultDCName: string;
  label: string;
}
export const BRAND_CONFIG: Record<BrandKey, BrandConfigEntry> = {
  homegoods: { dcMaster: DC_MASTER, pdfPrefix: "HG", defaultDCName: "HomeGoods Distribution Center", label: "HomeGoods" },
  tjx: { dcMaster: DC_MASTER_TJX, pdfPrefix: "TJX", defaultDCName: "T.J. Maxx Distribution Center", label: "T.J. Maxx" },
  marshalls: { dcMaster: DC_MASTER_MARSHALLS, pdfPrefix: "MAR", defaultDCName: "Marshalls Distribution Center", label: "Marshalls" },
  // ── Brands awaiting DC master / routing rules (UI placeholders) ──
  burlington: { dcMaster: {}, pdfPrefix: "BRL", defaultDCName: "Burlington Distribution Center", label: "Burlington" },
  sierra: { dcMaster: {}, pdfPrefix: "SRA", defaultDCName: "Sierra Distribution Center", label: "Sierra" },
  ddDiscount: { dcMaster: {}, pdfPrefix: "DDS", defaultDCName: "DD's Discounts Distribution Center", label: "DD's Discounts" },
};

/** Brands for which the routing logic is fully implemented. Others show a placeholder. */
export const ROUTING_READY_BRANDS: ReadonlyArray<BrandKey> = ["homegoods", "tjx", "marshalls"];

// BOL "Shipper Info" prefix differs slightly from the PDF-file prefix (TJM vs TJX).
export const BOL_PREFIX: Record<BrandKey, string> = {
  homegoods: "HG",
  tjx: "TJM",
  marshalls: "MAR",
  burlington: "BRL",
  sierra: "SRA",
  ddDiscount: "DDS",
};

// ── DEFAULT SKU METADATA (fallback when no file uploaded) ──
export const DEFAULT_SKU_META: Record<string, { price: number; weight: number }> = {
  QT15: { price: 1.95, weight: 0.0715 },
  QT12: { price: 1.95, weight: 0.0715 },
  QT18: { price: 1.95, weight: 0.0715 },
  QT54: { price: 1.95, weight: 0.0715 },
  QT27: { price: 1.95, weight: 0.0517 },
  QT26: { price: 1.95, weight: 0.0517 },
  QT99: { price: 1.95, weight: 0.0517 },
  QT55: { price: 1.95, weight: 0.0715 },
  QT37: { price: 1.95, weight: 0.0715 },
  QT94: { price: 1.95, weight: 0.0715 },
  QT13: { price: 3.75, weight: 0.1375 },
  QT16: { price: 3.75, weight: 0.1375 },
  QT19: { price: 3.75, weight: 0.1375 },
  QT22: { price: 3.75, weight: 0.1375 },
};

// ── PALLET CALCULATION CONSTANTS (matches HG Master Excel formulas) ──
export const CASES_PER_UNIT = 10;
export const LAYERS_20CT = 6;
export const CASES_PER_LAYER_20CT = 8;
export const LAYERS_10CT = 4;
export const CASES_PER_LAYER_10CT = 11;
export const MAX_LAYERS_PER_PALLET = 72;
export const PALLET_WEIGHT_LB = 80;

// Excel cell aliases used by the Shipment Summary (match HG Master cells exactly)
export const C23 = 8; // cases per pallet layer — 20ct pack
export const C25 = 11; // cases per pallet layer — 10ct pack
export const B23 = 6; // layers per pallet — 20ct pack
export const B25 = 4; // layers per pallet — 10ct pack
export const B27 = 72; // max total layers per pallet
export const B29 = 80; // pallet weight in lbs

export const SKUS_20CT = ["QT13", "QT16", "QT19", "QT22"];

// Fallback weights (lb/unit) and prices ($/unit) when skuMeta not available
export const SKU_WEIGHTS: Record<string, number> = {
  QT15: 0.0715, QT12: 0.0715, QT18: 0.0715, QT54: 0.0715, QT94: 0.0715,
  QT27: 0.0517, QT26: 0.0517, QT99: 0.0517, QT55: 0.0517, QT37: 0.0517,
  QT13: 0.1375, QT16: 0.1375, QT19: 0.1375, QT22: 0.1375,
};
export const SKU_PRICES: Record<string, number> = {
  QT15: 1.95, QT12: 1.95, QT18: 1.95, QT54: 1.95, QT94: 1.95,
  QT27: 1.95, QT26: 1.95, QT99: 1.95, QT55: 1.95, QT37: 1.95,
  QT13: 3.75, QT16: 3.75, QT19: 3.75, QT22: 3.75,
};

// ── Carrier Address Book ──
export interface CarrierBookEntry {
  carrier: string;
  name: string;
  street: string;
  csz: string;
}
export const CARRIER_BOOK: CarrierBookEntry[] = [
  { carrier: "SWIFT LOGISTICS LLC", name: "PT KEARNY CONSOLIDATION", street: "36 HACKENSACK AVENUE", csz: "KEARNY, NJ, 07032, USA" },
  { carrier: "SWIFT LOGISTICS LLC", name: "GILBERT CO - KEASBEY", street: "1000 RIVERSIDE DRIVE", csz: "KEASBEY, NJ, 08832, USA" },
  { carrier: "NATIONAL RETAIL TRANSPORTATION", name: "NRS CONSOL - LYNDHURST", street: "2020 VALLEY BROOK AVENUE", csz: "LYNDHURST, NJ, 07071, USA" },
  { carrier: "MAERSK WHS & DIST", name: "PERFORMANCE TEAM EDISON", street: "145B TALMADGE ROAD", csz: "EDISON, NJ, 08817, USA" },
  { carrier: "THE GILBERT COMPANY", name: "GILBERT CO - KEASBEY", street: "1000 RIVERSIDE DRIVE", csz: "KEASBEY, NJ, 08832, USA" },
  { carrier: "MET EXPRESS INC", name: "GILBERT CO - KEASBEY", street: "1000 RIVERSIDE DRIVE", csz: "KEASBEY, NJ, 08832, USA" },
  { carrier: "WERNER ENTERPRISES INC", name: "PERFORMANCE TEAM EDISON", street: "145B TALMADGE ROAD", csz: "EDISON, NJ, 08817, USA" },
  { carrier: "WORLD LOGISTICS IN", name: "NRS SECAUCUS DAFFYS 3PL", street: "1 DAFFYS WAY", csz: "SECAUCUS, NJ, 07094, USA" },
  { carrier: "SWIFT LOGISTICS BROKERAGE", name: "NRS SECAUCUS DAFFYS 3PL", street: "1 DAFFYS WAY", csz: "SECAUCUS, NJ, 07094, USA" },
];

// ── Brand-isolated default state ──
// HomeGoods ships with demo data (matches the original); TJX/Marshalls start empty.
export function makeDefaultBrandState(): Record<BrandKey, ShipmentState> {
  return {
    homegoods: {
      products: ["QT15", "QT12", "QT18", "QT54", "QT27", "QT26", "QT55", "QT37", "QT94", "QT13", "QT16", "QT19"],
      dcs: Object.entries(DC_MASTER).map(([num, d]) => ({ num, ...d })),
      qty: {
        // DEMO DATA ONLY — always upload the actual Excel sheet before generating labels
        QT15: { "882": 5, "883": 4, "884": 7, "885": 4, "886": 8, "887": 10, "890": 2 },
        QT12: { "882": 15, "883": 11, "884": 22, "885": 12, "886": 24, "887": 31, "890": 5 },
        QT18: { "882": 6, "883": 4, "884": 9, "885": 5, "886": 10, "887": 12, "890": 2 },
        QT54: { "882": 10, "883": 8, "884": 15, "885": 8, "886": 16, "887": 20, "890": 3 },
        QT27: { "882": 5, "883": 4, "884": 7, "885": 4, "886": 8, "887": 10, "890": 2 },
        QT26: { "882": 4, "883": 3, "884": 6, "885": 3, "886": 7, "887": 8, "890": 1 },
        QT55: { "882": 5, "883": 4, "884": 7, "885": 4, "886": 8, "887": 10, "890": 2 },
        QT37: { "882": 2, "883": 1, "884": 3, "885": 2, "886": 3, "887": 4, "890": 1 },
        QT94: { "882": 2, "883": 2, "884": 4, "885": 2, "886": 4, "887": 5, "890": 1 },
        QT13: { "882": 5, "883": 4, "884": 7, "885": 4, "886": 8, "887": 10, "890": 2 },
        QT16: { "882": 4, "883": 3, "884": 6, "885": 3, "886": 7, "887": 8, "890": 1 },
        QT19: { "882": 4, "883": 3, "884": 6, "885": 3, "886": 7, "887": 8, "890": 1 },
      },
      qtyFinal: {},
      // ← Final totals — QT54 is intentionally 40 (half of orig 80), not 80
      qtyFinalTotal: { QT15: 40, QT12: 120, QT18: 48, QT54: 40, QT27: 40, QT26: 32, QT55: 40, QT37: 16, QT94: 20, QT13: 40, QT16: 32, QT19: 32 },
      po: "50 631004",
      from: "Quikfoods Inc",
      skuMeta: {},
    },
    tjx: { products: [], dcs: [], qty: {}, qtyFinal: {}, qtyFinalTotal: {}, po: "", from: "Quikfoods Inc", skuMeta: {} },
    marshalls: { products: [], dcs: [], qty: {}, qtyFinal: {}, qtyFinalTotal: {}, po: "", from: "Quikfoods Inc", skuMeta: {} },
    burlington: { products: [], dcs: [], qty: {}, qtyFinal: {}, qtyFinalTotal: {}, po: "", from: "Quikfoods Inc", skuMeta: {}, burlington: defaultBurlingtonShipment() },
    sierra: { products: [], dcs: [], qty: {}, qtyFinal: {}, qtyFinalTotal: {}, po: "", from: "Quikfoods Inc", skuMeta: {}, sierra: defaultSierraShipment() },
    ddDiscount: { products: [], dcs: [], qty: {}, qtyFinal: {}, qtyFinalTotal: {}, po: "", from: "Quikfoods Inc", skuMeta: {}, burlington: defaultBurlingtonShipment() },
  };
}

// ── BOL default order rows (Page 1 + Page 2) ──
// Each tuple is [order, pkgs, weight, pallet, info, wms].
export const DEFAULT_P1: BolOrder[] = [
  { order: "16131982", pkgs: 107, weight: 852, pallet: true, info: "TJM PO 10 062715 1 Pallet", wms: "WMS S009823806" },
  { order: "16131983", pkgs: 121, weight: 948, pallet: true, info: "TJM PO 40 062715 1 Pallet", wms: "WMS S009823951" },
  { order: "16131984", pkgs: 102, weight: 830, pallet: true, info: "TJM PO 60 062715 1 Pallet", wms: "WMS S009823807" },
  { order: "16131985", pkgs: 198, weight: 1700, pallet: true, info: "TJM PO 70 062715 2 Pallets", wms: "WMS S009823808" },
  { order: "16131986", pkgs: 83, weight: 698, pallet: true, info: "TJM PO 80 062715 1 Pallet", wms: "WMS S009823952" },
  { order: "16127029", pkgs: 441, weight: 3603, pallet: true, info: "MAR PO 01 062707 3 Pallets", wms: "WMS S009823811" },
];

export const DEFAULT_P2: BolOrder[] = [
  { order: "16127040", pkgs: 24, weight: 252, pallet: true, info: "MAR PO 04 062707 1 Pallet", wms: "WMS S009823812" },
  { order: "16127042", pkgs: 91, weight: 699, pallet: true, info: "MAR PO 06 062707 1 Pallet", wms: "WMS S009823955" },
  { order: "16127047", pkgs: 38, weight: 334, pallet: true, info: "MAR PO 07 062707 1 Pallet", wms: "WMS S009823956" },
  { order: "16127055", pkgs: 17, weight: 202, pallet: true, info: "MAR PO 08 062707 1 Pallet", wms: "WMS S009823813" },
];
