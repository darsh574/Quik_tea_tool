// ─────────────────────────────────────────────────────────────────────────────
// PO history — persistence helpers backed by Supabase (po_records table).
// A full Routing + Label Format + BOL snapshot is upserted per (po_number, brand)
// so any shipment can be recalled months later by its PO number.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase/client";
import { computeSummary, poDigits } from "@/lib/formulas";
import { defaultBolForm } from "@/lib/bolHelpers";
import type {
  BrandKey,
  ShipmentState,
  LabelFormat,
  BolForm,
  PoRecord,
  BurlingtonShipment,
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

  // Prefer the Routing PO (source of truth). Fall back to the BOL Shipment PO #
  // only if Routing's PO is empty — important so that editing the PO on the
  // Routing tab doesn't get shadowed by a stale bol_po_number from an earlier
  // sheet upload, which would cause the (po_number, brand) upsert to overwrite
  // the wrong row.
  const poNumber = (shipmentState.po || bol.bol_po_number || "").trim();
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

  const username =
    (user?.user_metadata?.username as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

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
    created_by_username: username,
  };

  const { data, error } = await supabase
    .from("po_records")
    .upsert(row, { onConflict: "po_number,brand" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as PoRecord;
}

/**
 * Save a Burlington / DD Discount routing snapshot. Mirrors `savePoRecord` so
 * History shows the row identically — keyed by (headerPo, brand) with empty
 * label_format / bol_form (those flows aren't wired for these brands yet).
 *
 * Totals come from the SimplePoRouting component (so the History `Pallets`
 * column shows the same number as the bottom Total row).
 */
export interface SaveSimpleInput {
  brand: BrandKey;
  burlington: BurlingtonShipment;
  totals: {
    finalQty: number;
    weight: number;
    cu: number;
    pallets: number;
  };
  /** Optional — persist the in-progress BOL form too (used by the BOL tab's
   *  Sync / auto-save flow for Burlington / DD Discount). */
  bol?: BolForm;
}

export async function saveSimplePoRecord({
  brand,
  burlington,
  totals,
  bol,
}: SaveSimpleInput): Promise<PoRecord> {
  const supabase = createClient();

  const poNumber = (burlington.headerPo ?? "").trim();
  if (!poNumber) {
    throw new Error("No PO number set — fill the PO number above before submitting.");
  }
  const burlLines = Array.isArray(burlington.lines) ? burlington.lines : [];
  if (burlLines.length === 0) {
    throw new Error("No line items to save — add at least one line first.");
  }

  // Distinct product list for the History row's expanded view.
  const products = Array.from(
    new Set(burlLines.map((l) => l.product).filter((p) => p)),
  );

  const shipment_state: ShipmentState = {
    products,
    dcs: [],
    qty: {},
    qtyFinal: {},
    qtyFinalTotal: {},
    po: poNumber,
    from: "",
    skuMeta: {},
    burlington,
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const username =
    (user?.user_metadata?.username as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  const row = {
    po_number: poNumber,
    po_digits: poDigits(poNumber),
    brand,
    shipment_state,
    label_format: {} as Record<string, unknown>,
    // ALWAYS write a full BolForm shape — never `{}` — so future `loadRecord`
    // calls don't replace the live `bol` with an object missing required
    // arrays (`p1Orders` / `p2Orders`), which historically crashed the
    // dashboard with "Cannot read properties of undefined (reading 'reduce')".
    bol_form: bol ?? defaultBolForm(),
    summary: null,
    label_total: totals.finalQty,
    total_pallets: Math.round(totals.pallets),
    bol_number: bol?.bol_number || null,
    created_by: user?.id ?? null,
    created_by_username: username,
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

/** Delete a single PO record by id. */
export async function deletePoRecord(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("po_records").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
