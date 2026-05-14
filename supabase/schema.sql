-- ─────────────────────────────────────────────────────────────────────────────
-- QuikT Tool — Supabase schema
-- Run this in the Supabase Dashboard → SQL Editor (one time, on a fresh project).
-- ─────────────────────────────────────────────────────────────────────────────

-- One row per PO. Holds the full Routing + Label Format + BOL snapshot so the
-- whole shipment can be recalled by PO number months later. Saving the same PO
-- again upserts (updates) the existing row.
create table if not exists public.po_records (
  id              uuid primary key default gen_random_uuid(),
  po_number       text not null,
  po_digits       text not null,                 -- trailing digit group, used for search
  brand           text not null,                 -- 'homegoods' | 'tjx' | 'marshalls'
  shipment_state  jsonb not null default '{}'::jsonb,  -- products, dcs, qty, qtyFinalTotal, skuMeta...
  label_format    jsonb not null default '{}'::jsonb,
  bol_form        jsonb not null default '{}'::jsonb,
  summary         jsonb,                         -- computed per-DC summary + totals
  label_total     integer not null default 0,    -- total carton labels (for the list view)
  total_pallets   integer not null default 0,
  bol_number      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references auth.users (id) on delete set null
);

-- A PO is unique per brand (the same digits could theoretically appear under
-- different retailers). Upserts target this constraint.
create unique index if not exists po_records_po_brand_uniq
  on public.po_records (po_number, brand);

-- Fast lookup when the user types just the PO digits into the search box.
create index if not exists po_records_po_digits_idx on public.po_records (po_digits);
create index if not exists po_records_updated_at_idx on public.po_records (updated_at desc);

-- Keep updated_at fresh on every write.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists po_records_set_updated_at on public.po_records;
create trigger po_records_set_updated_at
  before update on public.po_records
  for each row execute function public.set_updated_at();

-- ── Row Level Security ──
-- This is an internal tool: any signed-in (authenticated) user has full access.
alter table public.po_records enable row level security;

drop policy if exists "authenticated full access" on public.po_records;
create policy "authenticated full access"
  on public.po_records
  for all
  to authenticated
  using (true)
  with check (true);
