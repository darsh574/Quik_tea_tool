// ─────────────────────────────────────────────────────────────────────────────
// SKU Master — Excel template + import.
// Column layout matches the team's "SKU MASTER.xlsx" workbook EXACTLY:
//   Row 1: section labels (merged) — Item / Unit / Case / Pallet
//   Row 2: column headers
//   Row 3+: data
//
// Client-side only — xlsx is bundled for the browser.
// ─────────────────────────────────────────────────────────────────────────────

import * as XLSX from "xlsx";
import { blankSkuMasterInput, type SkuMasterInput } from "@/lib/skuMaster";

type ColType = "text" | "int" | "num";

interface SkuColumn {
  key: keyof SkuMasterInput;
  label: string;
  section: "item" | "unit" | "case" | "pallet";
  type: ColType;
  width?: number;
}

/**
 * The 40 columns in the exact physical order they appear in the team's
 * "SKU Master June 2026" workbook. The parser maps each sheet cell to the
 * canonical column at the same position, so this order MUST match the sheet.
 * Used by BOTH the template generator and the parser, so they stay in sync.
 */
export const SKU_COLUMNS: SkuColumn[] = [
  // Item identity (columns A – H)
  { key: "item_code",        label: "Item Code",                        section: "item",   type: "text", width: 10 },
  { key: "item_description", label: "Item Description",                 section: "item",   type: "text", width: 50 },
  { key: "group_name",       label: "Group",                            section: "item",   type: "text", width: 22 },
  { key: "sub_group",        label: "Sub Group",                        section: "item",   type: "text", width: 14 },
  { key: "series",           label: "Series",                           section: "item",   type: "text", width: 10 },
  { key: "sachet_count",     label: "Sachet count",                     section: "item",   type: "int",  width: 12 },
  { key: "case_pack",        label: "Case Pack",                        section: "item",   type: "int",  width: 11 },
  { key: "alt_uom",          label: "Alt UOM",                          section: "item",   type: "num",  width: 10 },

  // Unit net weight (columns I – K)
  { key: "unit_net_wt_g",    label: "Unit Net wt (g.)",                 section: "item",   type: "num",  width: 16 },
  { key: "unit_net_wt_oz",   label: "Unit Net wt (Oz.)",                section: "item",   type: "num",  width: 16 },
  { key: "unit_net_wt_lb",   label: "Unit Net wt (lbs)",                section: "item",   type: "num",  width: 16 },

  // Carton net weight (columns L – M)
  { key: "carton_net_wt_kg", label: "carton net wt (kg)",               section: "item",   type: "num",  width: 18 },
  { key: "carton_net_wt_lb", label: "carton net wt (lb)",               section: "item",   type: "num",  width: 18 },

  // UPCs (columns N – O)
  { key: "gtin_upc_case_code", label: "GTIN Case Code (14 digit)",       section: "item",  type: "text", width: 30 },
  { key: "unit_upc_code",      label: "Unit UPC Code (12 digit)",        section: "item",  type: "text", width: 18 },

  // Shelf life (column P)
  { key: "shelf_life_months", label: "Shelf Life-Months (at production)", section: "item", type: "num",  width: 18 },

  // Unit dimensions / gross weight (columns Q – X, "unit" section)
  { key: "unit_length_cm",   label: "Length/Depth (cm)",                section: "unit",   type: "num",  width: 16 },
  { key: "unit_height_cm",   label: "Height (cm)",                      section: "unit",   type: "num",  width: 11 },
  { key: "unit_width_cm",    label: "Width (cm)",                       section: "unit",   type: "num",  width: 11 },
  { key: "unit_length_in",   label: "Length/Depth (in)",                section: "unit",   type: "num",  width: 16 },
  { key: "unit_height_in",   label: "Height (in)",                      section: "unit",   type: "num",  width: 11 },
  { key: "unit_width_in",    label: "Width (in)",                       section: "unit",   type: "num",  width: 11 },
  { key: "unit_gross_wt_g",  label: "Gross wt. (g)",                    section: "unit",   type: "num",  width: 14 },
  { key: "unit_gross_wt_oz", label: "Gross wt. (oz)",                   section: "unit",   type: "num",  width: 14 },

  // Case dimensions / gross weight (columns Y – AH, "case" section)
  { key: "case_cube_cuft",   label: "Case Cube (cu ft)",                section: "case",   type: "num",  width: 14 },
  { key: "case_cube_cbm",    label: "Case Cube (cbm)",                  section: "case",   type: "num",  width: 14 },
  { key: "case_length_cm",   label: "Length/Depth (cm)",                section: "case",   type: "num",  width: 16 },
  { key: "case_height_cm",   label: "Height (cm)",                      section: "case",   type: "num",  width: 11 },
  { key: "case_width_cm",    label: "Width (cm)",                       section: "case",   type: "num",  width: 11 },
  { key: "case_length_in",   label: "Length/Depth (in)",                section: "case",   type: "num",  width: 16 },
  { key: "case_height_in",   label: "Height (in)",                      section: "case",   type: "num",  width: 11 },
  { key: "case_width_in",    label: "Width (in)",                       section: "case",   type: "num",  width: 11 },
  { key: "case_gross_wt_lb", label: "Gross Case Wt (lbs)",              section: "case",   type: "num",  width: 18 },
  { key: "case_gross_wt_kg", label: "Gross wt (kg)",                    section: "case",   type: "num",  width: 14 },

  // Pallet (columns AI – AN, "Pallet" section)
  { key: "pallet_length_in", label: "Length/Dept (in.)",                section: "pallet", type: "num",  width: 16 },
  { key: "pallet_width_in",  label: "Width (in)",                       section: "pallet", type: "num",  width: 11 },
  { key: "pallet_height_in", label: "Height (in. not including Pallet)", section: "pallet", type: "num", width: 28 },
  { key: "pallet_ti",        label: "Ti",                               section: "pallet", type: "int",  width: 6 },
  { key: "pallet_hi",        label: "Hi",                               section: "pallet", type: "int",  width: 6 },
  { key: "pallet_cases_per_pallet", label: "Cases/Pallet",              section: "pallet", type: "int",  width: 13 },
];

const SHEET_NAME = "SKU Master";

// ── Type-safe value coercion ────────────────────────────────────────────────
function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}
function toInt(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? Math.round(v) : parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}
function toText(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  // Preserve leading zeros — read numeric UPCs as strings.
  return String(v).trim();
}

function coerce(type: ColType, v: unknown): string | number | null {
  if (type === "text") return toText(v);
  if (type === "int") return toInt(v);
  return toNumber(v);
}

// ── Template download ───────────────────────────────────────────────────────
/**
 * Generate the downloadable template — same shape as the user's master file:
 *   Row 1: section labels (merged)
 *   Row 2: column headers
 *   Row 3+: a couple of example rows so the format is unambiguous
 */
export function downloadSkuMasterTemplate(): void {
  const N = SKU_COLUMNS.length;

  // ── Row 1: section labels (Item / Unit / Case / Pallet) ──
  const sectionRow = new Array(N).fill("");
  sectionRow[0] = "SKU Master";

  // Track section spans for merging
  type Span = { start: number; end: number; label: string };
  const spans: Span[] = [];
  let curStart = 0;
  let curSection = SKU_COLUMNS[0].section;
  for (let i = 1; i <= N; i++) {
    if (i === N || SKU_COLUMNS[i].section !== curSection) {
      if (curSection !== "item") {
        spans.push({
          start: curStart,
          end: i - 1,
          label:
            curSection === "unit" ? "Unit" : curSection === "case" ? "Case" : "Pallet",
        });
      }
      if (i < N) {
        curStart = i;
        curSection = SKU_COLUMNS[i].section;
      }
    }
  }
  spans.forEach((s) => {
    sectionRow[s.start] = s.label;
  });

  // ── Row 2: column headers ──
  const headerRow = SKU_COLUMNS.map((c) => c.label);

  // ── Example rows (40 columns, in the canonical SKU_COLUMNS order) ──
  const example1 = [
    "QT11",
    "QuikTea Instant Cardamom Chai Tea Latte 2 Count x 20",
    "Instant Chai Latte", "Sweetened", "QT", 2, 20, 1,
    48, 1.6932, 0.1058, 0.96, 2.112,
    "10855664004171", "855664004174", 15,
    7.7, 10.7, 2.6, 3.0315, 4.2126, 1.0236, null, null,
    0.1457, 0.0041, 19, 13, 16.7, 7.4803, 5.1181, 6.5748, 3.1195, 1.415,
    48, 40, 56.3, 20, 12, 240,
  ];
  const example2 = [
    "QT18",
    "QuikTea Instant Ginger Chai Tea Latte 10 Count x 10",
    "Instant Chai Latte", "Sweetened", "QT", 10, 10, 1,
    240, 8.4659, 0.5291, 2.4, 5.28,
    "10855664004072", "855664004075", 15,
    12.8, 9, 7.1, 5.0394, 3.5433, 2.7953, null, null,
    0.393, 0.0111, 37.2, 11, 27.2, 14.6457, 4.3307, 10.7087, 7.165, 3.25,
    48, 40, 60.63, 11, 15, 165,
  ];

  const aoa: unknown[][] = [sectionRow, headerRow, example1, example2];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Merge section labels across their span
  ws["!merges"] = spans.map((s) => ({
    s: { r: 0, c: s.start },
    e: { r: 0, c: s.end },
  }));

  // Column widths
  ws["!cols"] = SKU_COLUMNS.map((c) => ({ wch: c.width ?? Math.max(c.label.length + 2, 10) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);

  XLSX.writeFile(wb, "SKU_Master_Template.xlsx", { bookType: "xlsx" });
}

// ── Parser ──────────────────────────────────────────────────────────────────

export interface ParsedSkuRow {
  row: number; // 1-based sheet row
  ok: boolean;
  data?: SkuMasterInput;
  error?: string;
}

/**
 * Parse an uploaded .xlsx / .xls / .csv. Locates the row whose first non-empty
 * cell is "Item Code" and reads the 30 columns starting from there using the
 * canonical column order. Works with the user's existing master sheet and
 * with the template we generate (identical shape).
 */
export async function parseSkuMasterFile(file: File): Promise<ParsedSkuRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  // Prefer any sheet whose name contains "SKU Master", else first sheet.
  const targetName =
    wb.SheetNames.find((n) => /sku\s*master/i.test(n)) || wb.SheetNames[0];
  if (!targetName) throw new Error("No sheets found in the workbook.");
  const ws = wb.Sheets[targetName];

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null });

  // Locate the "Item Code" header cell.
  let headerRowIdx = -1;
  let headerColIdx = -1;
  outer: for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] ?? "").trim().toLowerCase();
      if (v === "item code") {
        headerRowIdx = r;
        headerColIdx = c;
        break outer;
      }
    }
  }
  if (headerRowIdx < 0) {
    throw new Error(
      'Could not find an "Item Code" header. Download the template above to see the expected format.',
    );
  }

  const results: ParsedSkuRow[] = [];
  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const raw = aoa[r] ?? [];
    const rowNum = r + 1; // 1-based for error messages

    // First cell (Item Code) must have a value, else either skip blank rows or report.
    const codeCell = raw[headerColIdx];
    if (codeCell === null || codeCell === undefined || String(codeCell).trim() === "") {
      const allBlank = raw.every((c) => c === null || c === undefined || c === "");
      if (allBlank) continue;
      results.push({ row: rowNum, ok: false, error: "Missing Item Code." });
      continue;
    }

    // Build the input by mapping each canonical column.
    const input = blankSkuMasterInput();
    for (let i = 0; i < SKU_COLUMNS.length; i++) {
      const col = SKU_COLUMNS[i];
      const value = coerce(col.type, raw[headerColIdx + i]);
      (input as Record<string, unknown>)[col.key] = value;
    }
    // Item Code must end up a string
    input.item_code = String(input.item_code ?? "").trim();
    if (!input.item_code) {
      results.push({ row: rowNum, ok: false, error: "Missing Item Code." });
      continue;
    }

    results.push({ row: rowNum, ok: true, data: input });
  }

  return results;
}
