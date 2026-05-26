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
 */
export function syncBolFromBurlington(
  burlington: BurlingtonShipment,
  totals: { finalQty: number; weight: number; pallets: number },
): Partial<BolForm> {
  const po = burlington.headerPo.trim();
  const palletsInt = Math.max(0, Math.round(totals.pallets));
  const weightInt = Math.max(0, Math.round(totals.weight));
  const cartons = Math.max(0, Math.round(totals.finalQty));

  return {
    ...BURLINGTON_SHIP_TO,
    bol_po_number: po,
    hu_qty: String(palletsInt),
    hu_qty_p2: String(palletsInt),
    hu_pkg_qty: String(cartons),
    hu_weight: String(weightInt),
    commodity: cartons > 0 ? `${cartons} Cartons of Instant Chai Tea Latte` : "",
  };
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
