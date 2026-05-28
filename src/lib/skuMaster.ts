// ─────────────────────────────────────────────────────────────────────────────
// SKU Master — Supabase helpers for the central SKU catalogue.
// Backed by the public.sku_master table (see supabase/schema.sql).
// Column shape mirrors the team's "SKU MASTER.xlsx" exactly.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase/client";
import type { SkuMasterRow } from "@/lib/types";

/**
 * Editing the SKU Master is restricted to admins. Operators have read-only
 * access via `listSkuMaster`. The UI hides the edit affordances; this guard is
 * the defence-in-depth so a direct call still fails. The DB layer (RLS) can be
 * tightened separately if/when needed.
 */
async function requireAdmin(
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = (user?.user_metadata as { role?: unknown } | null)?.role;
  if (role !== "admin") {
    throw new Error("Only admins can modify the SKU Master.");
  }
}

/** Editable fields for create/update — everything except DB-managed timestamps + id. */
export type SkuMasterInput = Omit<
  SkuMasterRow,
  "id" | "created_at" | "updated_at" | "created_by" | "created_by_username"
>;

/** Empty input — every nullable field set to null, item_code blank. */
export function blankSkuMasterInput(): SkuMasterInput {
  return {
    item_code: "",
    item_description: null,
    group_name: null,
    sub_group: null,
    case_pack: null,
    unit_net_wt_g: null,
    unit_net_wt_oz: null,
    unit_net_wt_lb: null,
    carton_net_wt_kg: null,
    carton_net_wt_lb: null,
    gtin_upc_case_code: null,
    unit_upc_code: null,
    shelf_life_months: null,
    unit_height_in: null,
    unit_length_in: null,
    unit_width_in: null,
    unit_gross_wt_g: null,
    unit_gross_wt_oz: null,
    case_cube_cuft: null,
    case_height_in: null,
    case_length_in: null,
    case_width_in: null,
    case_gross_wt_lb: null,
    case_gross_wt_kg: null,
    pallet_length_in: null,
    pallet_width_in: null,
    pallet_height_in: null,
    pallet_ti: null,
    pallet_hi: null,
    pallet_cases_per_pallet: null,
  };
}

/** Normalise an input row: trim/upper item_code, coerce empty strings to null. */
function normalise(input: SkuMasterInput): SkuMasterInput {
  const out: SkuMasterInput = { ...input };
  out.item_code = (out.item_code || "").trim().toUpperCase();
  (Object.keys(out) as (keyof SkuMasterInput)[]).forEach((k) => {
    const v = out[k];
    if (v === undefined || v === "") (out as Record<string, unknown>)[k] = null;
  });
  return out;
}

/** Read every SKU, sorted alphabetically by item_code. */
export async function listSkuMaster(): Promise<SkuMasterRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("sku_master")
    .select("*")
    .order("item_code", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SkuMasterRow[];
}

/** Insert or update one SKU. Keyed by lower(item_code) — case-insensitive. */
export async function upsertSkuMaster(input: SkuMasterInput): Promise<SkuMasterRow> {
  const row = normalise(input);
  if (!row.item_code) throw new Error("Item Code is required.");

  const supabase = createClient();
  await requireAdmin(supabase);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const username =
    (user?.user_metadata?.username as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  const payload = {
    ...row,
    created_by: user?.id ?? null,
    created_by_username: username,
  };

  const { data, error } = await supabase
    .from("sku_master")
    .upsert(payload, { onConflict: "item_code" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SkuMasterRow;
}

/** Bulk insert / update for the Excel import flow. */
export async function bulkUpsertSkuMaster(
  inputs: SkuMasterInput[],
): Promise<{ saved: number; skipped: number; dedupedDuplicates: number; duplicateCodes: string[] }> {
  const supabase = createClient();
  await requireAdmin(supabase);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const username =
    (user?.user_metadata?.username as string | undefined) ||
    user?.email?.split("@")[0] ||
    null;

  const cleaned = inputs
    .map(normalise)
    .filter((r) => !!r.item_code)
    .map((r) => ({
      ...r,
      created_by: user?.id ?? null,
      created_by_username: username,
    }));

  const skipped = inputs.length - cleaned.length;
  if (cleaned.length === 0) {
    return { saved: 0, skipped, dedupedDuplicates: 0, duplicateCodes: [] };
  }

  // Deduplicate within the batch: Postgres ON CONFLICT can't update the same
  // target row twice in one statement. Keep the LAST occurrence of each
  // item_code (so a "fix later in the sheet" wins over an earlier row).
  const seenCounts = new Map<string, number>();
  const dedupMap = new Map<string, (typeof cleaned)[number]>();
  for (const r of cleaned) {
    seenCounts.set(r.item_code, (seenCounts.get(r.item_code) ?? 0) + 1);
    dedupMap.set(r.item_code, r);
  }
  const deduped = Array.from(dedupMap.values());
  const dedupedDuplicates = cleaned.length - deduped.length;
  const duplicateCodes = Array.from(seenCounts.entries())
    .filter(([, n]) => n > 1)
    .map(([code]) => code);

  const { error } = await supabase
    .from("sku_master")
    .upsert(deduped, { onConflict: "item_code" });
  if (error) throw new Error(error.message);
  return {
    saved: deduped.length,
    skipped,
    dedupedDuplicates,
    duplicateCodes,
  };
}

/** Delete one SKU by id. */
export async function deleteSkuMaster(id: string): Promise<void> {
  const supabase = createClient();
  await requireAdmin(supabase);
  const { error } = await supabase.from("sku_master").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
