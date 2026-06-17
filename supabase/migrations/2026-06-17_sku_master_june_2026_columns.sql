-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: align public.sku_master with the "SKU Master June 2026" workbook.
-- Adds the 10 columns that the new sheet introduced (Series, Sachet count,
-- Alt UOM, unit & case cm dimensions, and Case Cube cbm). Non-destructive —
-- run this in the Supabase SQL Editor on an existing DB instead of re-running
-- schema.sql (which would DROP the table and wipe the catalogue).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.sku_master
  -- ── Item identity ──
  add column if not exists series        text,
  add column if not exists sachet_count  integer,
  add column if not exists alt_uom       numeric,

  -- ── Unit dimensions (cm) ──
  add column if not exists unit_length_cm numeric,
  add column if not exists unit_height_cm numeric,
  add column if not exists unit_width_cm  numeric,

  -- ── Case ──
  add column if not exists case_cube_cbm  numeric,
  add column if not exists case_length_cm numeric,
  add column if not exists case_height_cm numeric,
  add column if not exists case_width_cm  numeric;

-- ── Clear the old catalogue ─────────────────────────────────────────────────
-- The previously-imported rows were parsed with the OLD 30-column layout, whose
-- column order differs from the new sheet — so that data is stale. Wipe it so
-- the June 2026 file can be re-imported cleanly. The table structure stays;
-- only the rows are removed.
delete from public.sku_master;
