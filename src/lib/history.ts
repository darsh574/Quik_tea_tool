// ─────────────────────────────────────────────────────────────────────────────
// PO history — persistence helpers backed by Supabase (po_records table).
// A full Routing + Label Format + BOL snapshot is upserted per (po_number, brand)
// so any shipment can be recalled months later by its PO number.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase/client";
import { computeSummary, poDigits } from "@/lib/formulas";
import type {
  BrandKey,
  ShipmentState,
  LabelFormat,
  BolForm,
  PoRecord,
} from "@/lib/types";

export interface SaveInput {
  brand: BrandKey;
  shipmentState: ShipmentState;
  format: LabelFormat;
  bol: BolForm;
}

/** Upsert the current shipment as a PO record. Keyed on (po_number, brand). */
export async function savePoRecord({ brand, shipmentState, format, bol }: SaveInput): Promise<PoRecord> {
  const supabase = createClient();

  // Prefer the explicit BOL Shipment PO #, fall back to the routing PO.
  const poNumber = (bol.bol_po_number || shipmentState.po || "").trim();
  if (!poNumber) {
    throw new Error("No PO number set — fill the PO on the Routing tab or the BOL Shipment PO #.");
  }

  const summary = computeSummary(shipmentState);
  const labelTotal = shipmentState.products.reduce(
    (s, p) =>
      s +
      shipmentState.dcs.reduce(
        (a, dc) => a + ((shipmentState.qty[p] && shipmentState.qty[p][dc.num]) || 0),
        0
      ),
    0
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const row = {
    po_number: poNumber,
    po_digits: poDigits(poNumber),
    brand,
    shipment_state: shipmentState,
    label_format: format,
    bol_form: bol,
    summary,
    label_total: labelTotal,
    total_pallets: summary ? Math.round(summary.tot.pallets) : 0,
    bol_number: bol.bol_number || null,
    created_by: user?.id ?? null,
  };

  const { data, error } = await supabase
    .from("po_records")
    .upsert(row, { onConflict: "po_number,brand" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as PoRecord;
}

/** Search saved POs by full PO or trailing digits. Empty query → recent records. */
export async function searchPoRecords(query: string): Promise<PoRecord[]> {
  const supabase = createClient();
  const q = query.trim();

  let req = supabase.from("po_records").select("*").order("updated_at", { ascending: false });

  if (q) {
    const digits = poDigits(q);
    // Match either the raw PO string or the normalised trailing digits.
    req = req.or(`po_number.ilike.%${q}%,po_digits.ilike.%${digits}%`);
  } else {
    req = req.limit(50);
  }

  const { data, error } = await req;
  if (error) throw new Error(error.message);
  return (data ?? []) as PoRecord[];
}

/** Fetch a single record by id. */
export async function getPoRecord(id: string): Promise<PoRecord | null> {
  const supabase = createClient();
  const { data, error } = await supabase.from("po_records").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PoRecord) ?? null;
}
