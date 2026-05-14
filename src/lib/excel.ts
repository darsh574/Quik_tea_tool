// ─────────────────────────────────────────────────────────────────────────────
// Excel / CSV import — ported VERBATIM from platform_updt.html handleFileUpload.
// Parses the Quikfoods shipment sheet for whichever brand is currently active.
// All quantities are automatically ÷10 (the spreadsheet stores ×10 carton count).
// ─────────────────────────────────────────────────────────────────────────────

import * as XLSX from "xlsx";
import { BRAND_CONFIG } from "./constants";
import type { BrandKey, DC, QtyMap, SkuMeta } from "./types";

export interface ParsedSheet {
  products: string[];
  dcs: DC[];
  qty: QtyMap;
  skuMeta: Record<string, SkuMeta>;
  sheetPO: string;
  totalLabels: number;
  brand: BrandKey;
}

type SheetRow = (string | number)[];

/**
 * Marshalls lookup table at cols 13-14:
 *   col 13 = "AZR: MAR PHOENIX", col 14 = street, next row col 14 = city
 */
function parseMarshallsAddresses(rows: SheetRow[]): Record<string, { street: string; city: string }> {
  const addresses: Record<string, { street: string; city: string }> = {};
  for (let r = 0; r < rows.length; r++) {
    const label = String((rows[r] && rows[r][13]) || "").trim();
    const match = label.match(/^([A-Z]{3}):/);
    if (match) {
      const code = match[1];
      const street = String((rows[r] && rows[r][14]) || "").trim();
      let city = "";
      if (r + 1 < rows.length) {
        city = String((rows[r + 1] && rows[r + 1][14]) || "").trim();
      }
      addresses[code] = { street, city };
    }
  }
  return addresses;
}

/**
 * Parse a shipment workbook (ArrayBuffer) into structured brand state.
 * Throws an Error with a user-facing message on a malformed sheet.
 */
export function parseShipmentSheet(data: ArrayBuffer, activeBrand: BrandKey): ParsedSheet {
  const wb = XLSX.read(new Uint8Array(data), { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<SheetRow>(ws, { header: 1, defval: "", raw: true });

  // ── All 3 brands use the same Excel layout: DC# in col 5, SKU in col 0 ──
  const dcMaster = BRAND_CONFIG[activeBrand].dcMaster;
  const defaultDCName = BRAND_CONFIG[activeBrand].defaultDCName;

  const DC_COLS = [5, 6, 7, 8, 9, 10, 11];
  const skuCol = 0;

  // Locate DC numbers row: scan col F (idx 5) for a 3-digit 8xx number
  let dcNumRowIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const cell = String((rows[r] && rows[r][5]) || "").trim();
    if (/^8[0-9]{2}$/.test(cell)) {
      dcNumRowIdx = r;
      break;
    }
  }
  if (dcNumRowIdx === -1) {
    throw new Error(
      "Cannot find DC number row (expected 3-digit codes like 882 in column F). " +
        "Please check your file matches the Quikfoods shipment format."
    );
  }

  const dcCodeRowIdx = dcNumRowIdx - 2;
  const dcPrefixRowIdx = dcNumRowIdx - 1;

  const parsedDCNums = DC_COLS.map((c) => String((rows[dcNumRowIdx] && rows[dcNumRowIdx][c]) || "").trim());
  const parsedDCCodes = DC_COLS.map((c) =>
    String((rows[Math.max(0, dcCodeRowIdx)] && rows[Math.max(0, dcCodeRowIdx)][c]) || "").trim()
  );
  const parsedDCPrefixes = DC_COLS.map((c) =>
    String((rows[Math.max(0, dcPrefixRowIdx)] && rows[Math.max(0, dcPrefixRowIdx)][c]) || "").trim()
  );

  // ── Parse address lookup from sheet (Marshalls only — TJX col 17 has merged garbage) ──
  let parsedAddresses: Record<string, { street: string; city: string }> = {};
  if (activeBrand === "marshalls") {
    parsedAddresses = parseMarshallsAddresses(rows);
  }

  // ── Parse PO number from sheet ──
  // Scan ALL rows for "PO" label in cols 0-3, grab adjacent pure-numeric value.
  // Take the LAST valid match (TJX has a header "PO" row with no number first).
  let sheetPO = "";
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c <= 3; c++) {
      const cellVal = String((rows[r] && rows[r][c]) || "").trim().toUpperCase();
      if (cellVal === "PO" || cellVal === "PO#" || cellVal === "PO #") {
        const nextVal = String((rows[r] && rows[r][c + 1]) || "").trim();
        // Only accept pure numeric values (no letters) to avoid grabbing labels
        if (nextVal && /^\d+$/.test(nextVal)) {
          sheetPO = nextVal; // keep scanning — take the last valid match
        }
      }
    }
  }

  // ── Find first product row ──
  let dataStartRow = dcNumRowIdx + 1;
  for (let r = dcNumRowIdx + 1; r < rows.length; r++) {
    const a = String((rows[r] && rows[r][skuCol]) || "").trim();
    if (/^QT\d/i.test(a)) {
      dataStartRow = r;
      break;
    }
  }

  // ── Parse product rows ──
  const newProducts: string[] = [];
  const newQty: QtyMap = {};
  const newSkuMeta: Record<string, SkuMeta> = {};

  for (let r = dataStartRow; r < rows.length; r++) {
    const row = rows[r];
    const prod = String((row && row[skuCol]) || "").trim().toUpperCase();
    if (!prod || !/^QT\d/i.test(prod)) continue;

    if (!newProducts.includes(prod)) newProducts.push(prod);
    if (!newQty[prod]) newQty[prod] = {};

    // Capture SP (col B = index 1) and Wt (col C = index 2) per SKU
    if (!newSkuMeta[prod]) {
      newSkuMeta[prod] = {
        price: parseFloat(String((row && row[1]) || "").replace(/,/g, "")) || 0,
        weight: parseFloat(String((row && row[2]) || "").replace(/,/g, "")) || 0,
      };
    }

    DC_COLS.forEach((col, i) => {
      const dcNum = parsedDCNums[i];
      if (!dcNum) return;
      const raw = parseFloat(String((row && row[col]) ?? "").replace(/,/g, "")) || 0;
      newQty[prod][dcNum] = Math.round(raw / 10);
    });
  }

  // Remove products where all DC qtys are 0
  const filteredProducts = newProducts.filter((prod) =>
    Object.values(newQty[prod] || {}).some((v) => v > 0)
  );
  newProducts.length = 0;
  filteredProducts.forEach((p) => newProducts.push(p));

  if (!newProducts.length) {
    throw new Error("No product rows found with non-zero quantities.");
  }

  // ── Build DC list ──
  const newDCs: DC[] = [];
  parsedDCNums.forEach((num, i) => {
    if (!num) return;
    if (newDCs.find((d) => d.num === num)) return;
    const sheetPrefix = parsedDCPrefixes[i];
    if (dcMaster[num]) {
      const master = dcMaster[num];
      // Overlay addresses parsed from sheet lookup table (TJX/Marshalls)
      let street = master.street;
      let city = master.city;
      if (parsedAddresses[master.code]) {
        if (parsedAddresses[master.code].street) street = parsedAddresses[master.code].street;
        if (parsedAddresses[master.code].city) city = parsedAddresses[master.code].city;
      }
      newDCs.push({
        num,
        code: master.code,
        poPrefix: sheetPrefix || master.poPrefix,
        name: master.name,
        street,
        city,
      });
    } else {
      newDCs.push({
        num,
        code: parsedDCCodes[i] || num,
        poPrefix: sheetPrefix || "",
        name: defaultDCName,
        street: "",
        city: "",
      });
    }
  });

  const totalLabels = newProducts.reduce(
    (s, p) => s + Object.values(newQty[p] || {}).reduce((a, v) => a + v, 0),
    0
  );

  return {
    products: newProducts,
    dcs: newDCs,
    qty: newQty,
    skuMeta: newSkuMeta,
    sheetPO,
    totalLabels,
    brand: activeBrand,
  };
}
