// ─────────────────────────────────────────────────────────────────────────────
// BOL helpers — default form values + "Sync from Summary" logic.
// Ported VERBATIM from platform_updt.html (BOL defaults + syncBOLFromSummary).
// ─────────────────────────────────────────────────────────────────────────────

import { BOL_PREFIX, DEFAULT_P1, DEFAULT_P2 } from "./constants";
import type {
  BolForm,
  BolOrder,
  BrandKey,
  SummaryData,
  BurlingtonShipment,
  SierraShipment,
} from "./types";

/**
 * Burlington's default Ship-To address (per the reference screenshot).
 * Applied when the user syncs the BOL from a Burlington routing — the brand
 * has a single canonical Ship-To, unlike HG/TJX/Marshalls which fan out to
 * many DCs. Ship-From and other fields are intentionally left untouched.
 */
export const BURLINGTON_SHIP_TO = {
  st_name: "Burlington Coat Factory",
  st_location: "53_NJ",
  st_address: "4287 US-130 SOUTH",
  st_csz: "EDGEWATER PARK, NJ, 08010, US",
} as const;

/**
 * Burlington / DD Discount sync — pulls only the fields we're confident about
 * from the line-item routing. Everything else (carrier, BOL #, load ID, dates,
 * authorisation, etc.) is left blank for the user to enter manually.
 *
 * The Burlington address is a single fixed DC (Edgewater Park, NJ), so we
 * auto-apply Ship-To for that brand only. DD Discount BOLs ship to varying
 * destinations (sometimes a carrier depot, sometimes the East Coast DC) —
 * per the reference BOL we leave Ship-To blank for DD Discount and let the
 * user fill it in for that specific shipment.
 */
export function syncBolFromBurlington(
  burlington: BurlingtonShipment,
  totals: { finalQty: number; weight: number; pallets: number },
  brand: BrandKey = "burlington",
): Partial<BolForm> {
  const po = burlington.headerPo.trim();
  const palletsInt = Math.max(0, Math.round(totals.pallets));
  const weightInt = Math.max(0, Math.round(totals.weight));
  const cartons = Math.max(0, Math.round(totals.finalQty));

  // Brand-specific commodity copy — matches each customer's BOL wording.
  const commodity =
    cartons <= 0
      ? ""
      : brand === "ddDiscount"
      ? `${cartons} cartons of QUIKTEA CHAI TEA LATTE & COFFEE`
      : `${cartons} cartons of CHAI TEA LATTE`;

  // Replace the customer-orders tables with a single brand-appropriate row so
  // the TJX-style demo defaults (DEFAULT_P1) don't leak through after a sync.
  const palletWord = palletsInt === 1 ? "1 Pallet" : `${palletsInt} Pallets`;
  const shipperInfo =
    brand === "ddDiscount"
      ? `${palletWord} (East Coast DC)`
      : `${palletWord} (PO# ${po})`;
  const p1Orders: BolOrder[] =
    cartons > 0
      ? [
          {
            order: po,
            pkgs: cartons,
            weight: weightInt,
            pallet: true,
            info: shipperInfo,
            wms: "",
          },
        ]
      : [];

  return {
    ...(brand === "burlington" ? BURLINGTON_SHIP_TO : {}),
    bol_po_number: po,
    hu_qty: String(palletsInt),
    hu_qty_p2: String(palletsInt),
    hu_pkg_qty: String(cartons),
    hu_weight: String(weightInt),
    commodity,
    p1Orders,
    p2Orders: [],
  };
}

/**
 * Sierra Trading Post sync — pulls confident fields from the Sierra matrix.
 * Ship-To is only auto-applied when the routing touches exactly one DC
 * (unambiguous); for multi-DC POs the user picks the destination manually.
 *
 * Reference BOL: `Sierra BOL 810R958456.pdf`
 *   PO #          → bol_po_number = sierra.poNumber
 *   Ship-To       → from the single DC's address (when unambiguous)
 *   Handling Qty  → totalPallets (rounded)
 *   Package Qty   → totalCases (sum of all final values)
 *   Weight        → totalWeight (rounded, lb)
 *   Commodity     → "{N} Cases of Instant Chai Tea Latte premix powder"
 */
export function syncBolFromSierra(
  sierra: SierraShipment,
  totals: {
    totalCases: number;
    totalWeight: number;
    totalPallets: number;
  },
): Partial<BolForm> {
  const po = (sierra.poNumber ?? "").trim();
  const cases = Math.max(0, Math.round(totals.totalCases));
  const weight = Math.max(0, Math.round(totals.totalWeight));
  const pallets = Math.max(0, Math.round(totals.totalPallets));

  // Single-DC heuristic: if exactly one DC has any final cases, fill that
  // DC's address. Otherwise leave Ship-To untouched.
  const dcs = Array.isArray(sierra.dcs) ? sierra.dcs : [];
  const lines = Array.isArray(sierra.lines) ? sierra.lines : [];
  const dcsWithData = dcs.filter((d) =>
    lines.some(
      (l) =>
        typeof l.final?.[d.num] === "number" &&
        (l.final[d.num] as number) > 0,
    ),
  );

  // One customer-order row per DC that actually has shipments. Matches the
  // Sierra reference BOL format: `1 Pallet (PO#{dc.num}{po})`.
  const p1Orders: BolOrder[] = [];
  dcsWithData.forEach((dc) => {
    let dcCases = 0;
    lines.forEach((l) => {
      const v =
        typeof l.final?.[dc.num] === "number"
          ? (l.final[dc.num] as number)
          : 0;
      dcCases += v;
    });
    const dcWeight =
      dcCases > 0
        ? dcCases * 8 +
          // matches SIERRA_WEIGHT_BASES from constants.ts (90 / 120)
          (sierra.dcs.indexOf(dc) === 0 ? 90 : 120)
        : 0;
    p1Orders.push({
      order: po,
      pkgs: dcCases,
      weight: Math.round(dcWeight),
      pallet: true,
      info: `1 Pallet (PO#${dc.num}${po})`,
      wms: "",
    });
  });

  const patch: Partial<BolForm> = {
    bol_po_number: po,
    hu_qty: String(pallets),
    hu_qty_p2: String(pallets),
    hu_pkg_qty: String(cases),
    hu_weight: String(weight),
    commodity:
      cases > 0
        ? `${cases} Cases of Instant Chai Tea Latte premix powder`
        : "",
    p1Orders,
    p2Orders: [],
  };

  if (dcsWithData.length === 1) {
    const dc = dcsWithData[0];
    patch.st_name = dc.name || "Sierra Distribution Center";
    patch.st_location = dc.num;
    patch.st_address = dc.street || "";
    patch.st_csz = dc.city || "";
  }

  return patch;
}

/** The initial Bill of Lading form, matching the original tool's default inputs. */
export function defaultBolForm(): BolForm {
  return {
    sf_name: "Quikfoods Inc.",
    sf_address: "11 CORN ROAD SUITE B",
    sf_csz: "DAYTON, NJ, 08810, USA",
    sf_sid: "",
    sf_fob: "",
    bol_number: "03052026003",
    load_id: "9013685",
    bol_po_number: "",
    auth_num: "",
    freight_terms: "Collect",
    st_name: "NRS SECAUCUS DAFFYS 38",
    st_location: "",
    st_address: "1 DAFFYS WAY",
    st_csz: "SECAUCUS, NJ, 07094, USA",
    st_cid: "",
    st_fob: "",
    carrier_name: "WORLD LOGISTICS IN",
    trailer_number: "",
    seal_number: "",
    scac: "",
    pro_number: "",
    appt_time: "",
    driver_arrival: "",
    driver_depart: "",
    tp_name: "",
    tp_address: "",
    tp_csz: "",
    hu_qty: "6",
    hu_type: "Pallets",
    hu_pkg_qty: "",
    hu_pkg_type: "Cartons",
    hu_weight: "",
    commodity: "611 Cartons of Instant Chai Tea Latte",
    nmfc: "",
    ltl_class: "",
    pallet_summary: "TJX Marshalls - 13",
    cod_amount: "",
    hu_qty_p2: "7",
    hu_type_p2: "Pallets",
    p1Orders: DEFAULT_P1.map((o) => ({ ...o })),
    p2Orders: DEFAULT_P2.map((o) => ({ ...o })),
  };
}

/**
 * Re-populate Handling QTY, Commodity, and Page-1 Customer Orders from the
 * Shipment Summary. Returns a partial BolForm patch; Page 2 orders are cleared.
 * Mirrors syncBOLFromSummary() from the original tool.
 */
export function syncBolFromSummary(
  summary: SummaryData,
  activeBrand: BrandKey,
  bolPO: string
): Partial<BolForm> {
  const { dcData, tot } = summary;
  const prefix = BOL_PREFIX[activeBrand] || "TJM";
  const po = (bolPO || "").trim();

  const p1Orders: BolOrder[] = dcData
    .filter((d) => d.totalCases > 0)
    .map((d) => {
      const palletWord =
        Math.round(d.pallets) === 1 ? "1 Pallet" : Math.round(d.pallets) + " Pallets";
      const shipperInfo = po
        ? `${prefix} PO ${d.dc.poPrefix} ${po} ${palletWord}`
        : `${prefix} PO ${d.dc.poPrefix} ${palletWord}`;
      return {
        order: "",
        pkgs: Math.round(d.totalCases),
        weight: Math.ceil(d.grossWt),
        pallet: d.pallets >= 1,
        info: shipperInfo,
        wms: "",
      };
    });

  return {
    hu_qty: String(Math.round(tot.pallets)),
    hu_qty_p2: String(Math.round(tot.pallets)),
    commodity: Math.round(tot.totalCases) + " Cartons of Instant Chai Tea Latte",
    p1Orders,
    p2Orders: [],
  };
}

/** Update the embedded 6-digit PO inside every order's Shipper Info string. */
export function updateShipperInfoPO(orders: BolOrder[], poVal: string): BolOrder[] {
  const po = (poVal || "").trim();
  if (!po) return orders;
  return orders.map((o) => {
    const current = o.info;
    let updated = current.replace(/\b\d{6}\b/, po);
    if (updated === current) updated = current.replace(/\b\d{5,7}\b/, po);
    if (updated === current && !current.includes(po)) updated = po;
    return { ...o, info: updated };
  });
}

/** Trigger a browser download of a jsPDF document's blob. */
export function poDigitsFromBol(bol: BolForm): string {
  const raw = (bol.bol_po_number || "").replace(/\s+/g, "");
  const m = raw.match(/(\d+)$/);
  return m ? m[1] : raw;
}
