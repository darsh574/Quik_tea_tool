# QuikT Tool — Project Overview

> A descriptive guide to the QuikT Tool codebase: what it is, how it's built,
> how data flows through it, and where to find each piece. For setup and
> deployment steps see `README.md`; for the rules a developer must not break see
> `CLAUDE.md`.

---

## 1. What this is

**QuikT Tool** is an internal shipment dashboard for **QuikTea / Quikfoods**. It
takes a shipment from raw purchase-order spreadsheet all the way to printable
carton labels and a signed-ready Bill of Lading, and remembers every shipment by
PO number so it can be reproduced months later.

It is a faithful, production-grade port of a single-file prototype
(`platform_updt.html`, kept in the parent folder) into a real web app. Every
shipment formula, constant, and PDF spec was carried over **verbatim** — the
brand derived those numbers from their own research and Excel sheets, so the port
preserves them byte-for-byte rather than "improving" them.

It supports six retail destinations:

| Brand | Routing style |
|-------|---------------|
| **HomeGoods** | Standard product × DC quantity matrix |
| **T.J. Maxx** | Standard product × DC quantity matrix |
| **Marshalls** | Standard product × DC quantity matrix |
| **Burlington** | Simple line-item PO form |
| **DD's Discounts** | Simple line-item PO form (labels use SKU Master) |
| **Sierra Trading Post** | Product × DC matrix editor |

---

## 2. Technology stack

| Layer | Choice |
|-------|--------|
| Framework | **Next.js 14** (App Router) + **TypeScript** + **React 18** |
| State | **Zustand** (single store, persisted to `localStorage`) |
| Backend / DB / Auth | **Supabase** (Postgres + Auth) |
| PDF generation | **jsPDF** (labels + BOL), **JSZip** (label bundles) |
| Spreadsheets | **xlsx** (import + export) |
| Styling | Ported CSS variables in `globals.css` + **TailwindCSS** available |
| AI assistant | **OpenRouter** proxied server-side |
| Hosting | **Vercel** (app + API routes) + **Supabase** (database) |

Package version `1.0.0`. Scripts: `npm run dev`, `build`, `start`, `lint`,
`typecheck`.

---

## 3. The big architectural idea: one route, many tabs

The entire app is a **single dashboard route** — `/dashboard`. The eight tabs
(Home, Routing, Labels, BOL, Amazon, History, SKU Master, Settings) are **not**
separate routes. They are all mounted at once inside one client component
(`DashboardTabs.tsx`), and switching tabs just toggles CSS `display` based on
`activeTab` in the Zustand store.

This is deliberate:

- **Instant tab switching** — no navigation, no middleware round-trip, no chunk
  reload (separate routes previously caused a ~1s lag per switch).
- **Preserved state** — because every tab stays mounted, scroll position and
  in-progress form edits survive a tab switch.

A single Zustand store carries one PO's data across the Routing, Labels and BOL
tabs, which is what makes the workflow feel continuous.

---

## 4. Directory map

```
quikt-tool/
├── CLAUDE.md                       # Rules for working in this repo (the "don't touch the math" rule)
├── README.md                       # Setup + deployment walkthrough
├── PROJECT_OVERVIEW.md             # ← this document
├── package.json
├── next.config.mjs                 # xlsx in serverComponentsExternalPackages
├── supabase/
│   ├── schema.sql                  # po_records + sku_master tables, indexes, RLS, triggers
│   └── migrations/                 # incremental schema changes (e.g. SKU Master)
├── scripts/seed-admin.mjs          # one-time admin user seed
└── src/
    ├── middleware.ts               # root auth gate → delegates to lib/supabase/middleware
    ├── app/
    │   ├── layout.tsx              # root layout
    │   ├── page.tsx                # "/" → redirected to /login by middleware
    │   ├── login/page.tsx          # username/email + password sign-in
    │   ├── dashboard/
    │   │   ├── layout.tsx          # server: auth check + <DashboardChrome>
    │   │   └── page.tsx            # renders <DashboardTabs /> (the only dashboard route)
    │   └── api/
    │       ├── admin/users/        # GET/POST users, [id] PATCH/DELETE, [id]/password POST
    │       ├── amazon/             # status, listings (PATCH), reports (POST)
    │       └── assistant/          # POST → OpenRouter chat proxy
    ├── components/                 # all tab UIs + chrome (see §6)
    ├── lib/                        # ported logic + supabase + amazon (see §5)
    └── store/useShipmentStore.ts   # the single Zustand store (see §7)
```

`dashboard/layout.tsx` and `dashboard/page.tsx` are **server** components; every
tab UI plus `DashboardChrome` / `DashboardTabs` are `"use client"`. PDF/Excel
libraries (`jspdf`, `jszip`, `xlsx`) run **client-side only**.

---

## 5. The logic layer (`src/lib/`)

### Ported, must-not-change files

These were carried over verbatim from `platform_updt.html`. Changing a number,
rounding step, or constant here is forbidden (see `CLAUDE.md`).

| File | Responsibility |
|------|----------------|
| `constants.ts` | `SPEC` (label PDF geometry), the 3 DC masters (HomeGoods / TJX / Marshalls), `BRAND_CONFIG`, `BOL_PREFIX`, `DEFAULT_SKU_META`, `CARRIER_BOOK`, pallet constants (`C23=8`, `B27=72`, `B29=80`, …), Sierra/Burlington defaults, and `makeDefaultBrandState()` |
| `formulas.ts` | `poDigits()` (trailing-digit extraction), `computeFinalQty()` (per-DC final qty via `ceil(orig/total × final)`), `computeSummary()` (cases, pallets, net/gross weight, value — all rounded **up** with `Math.ceil`) |
| `excel.ts` | `parseShipmentSheet()` — reads the Quikfoods sheet, auto-detects DCs and brand, extracts the PO, and divides quantities by 10 (the sheet stores ×10 the real carton count) |
| `labelPdf.ts` | `generateLabelZip()` — builds one 6"×4" PDF per product×DC, nested into a ZIP as `{poDigits}/{dcNum}/…`. Supports standard, DD Discount (SKU-Master-driven), and Sierra templates |
| `bolPdf.ts` | `buildBolPDF()` — Letter-size Bill of Lading, **editable** (AcroForm fields) by default or **static** for preview; auto-paginates Page 2 orders |
| `bolHelpers.ts` | BOL defaults + `syncBolFromSummary` / `syncBolFromBurlington` / `syncBolFromSierra` — auto-fill the BOL from routing totals |

> **Intentional quirks (do not "fix"):** `QT54` final total is `40` (half of 80);
> Net/Gross weight and Value round up with `Math.ceil`; import divides by 10; the
> BOL shipper prefix is `TJM` while the label file prefix is `TJX`.

### Supporting logic

| File | Responsibility |
|------|----------------|
| `types.ts` | All domain types: `BrandKey`, `TabKey`, `ShipmentState`, `DC`, `BolForm`/`BolOrder`, `LabelFormat`, `Burlington*`/`Sierra*`, `SkuMasterRow`, `PoRecord` |
| `history.ts` | `savePoRecord()` (upsert keyed on `po_number`+`brand`), `loadPoRecord()`, `searchPoRecords()`, `deletePoRecord()`, plus Burlington/Sierra save variants |
| `historyExcel.ts` | Export one PO or a list of POs to an Excel workbook |
| `labelFormat.ts` | Canonical default label-format values (Dept #, vendor label, country = India, etc.) |
| `skuMaster.ts` / `skuExcel.ts` | SKU Master CRUD against `sku_master`, plus its ~40-column Excel import/export and blank template |
| `burlingtonAdapter.ts` / `sierraAdapter.ts` | Convert the special-brand routing shapes into a standard `ShipmentState` so labels/BOL can reuse the standard generators |
| `supabase/` | `client.ts` (browser, anon key), `server.ts` (cookie-backed), `admin.ts` (service-role, bypasses RLS), `middleware.ts` (session refresh + auth redirects) |
| `auth/` | `permissions.ts` (roles + 7 per-tab toggles), `requireAdmin.ts` (API guard) |
| `amazon/` | `client.ts` (multi-region SP-API client, LWA token cache, retry-on-429) + `regions.ts` (NA/EU/FE endpoints, marketplace IDs) — inert until `AMAZON_*` env vars are set |

---

## 6. The UI layer (`src/components/`)

### Chrome & shared pieces

- **`DashboardChrome.tsx`** — header, the brand selector, the sidebar nav buttons
  (which are `<button>`s calling `setActiveTab`, **not** links), sign-out, and the
  AI assistant. Nav items are permission-gated per user.
- **`DashboardTabs.tsx`** — mounts all eight tab components, shows only the active
  one via `display`.
- **`UserContext.tsx`** — `useCurrentUser()` hook exposing id, username, role, and
  permissions.
- **`PoPicker.tsx`** — shared "load a PO from history" modal (used by Labels, BOL).
- **`SummaryTable.tsx`** — renders the per-DC + total Shipment Summary.
- **`AssistantWidget.tsx`** — chat bubble → `/api/assistant`.

### The tabs

| Tab | Component | What it does |
|-----|-----------|--------------|
| **Home** | `DashboardHome.tsx` | Welcome, quick-action cards, recent POs, status badges |
| **Routing** | `routing/RoutingTab.tsx` | Upload Excel/CSV (qty ÷10), set PO + sender, edit products / DCs / quantities, see the live Shipment Summary, save. Renders one of three editors by brand: standard matrix, `SimplePoRouting` (Burlington / DD Discount), or `SierraRouting` (matrix) |
| **Label Generator** | `labels/LabelsTab.tsx` | Edit label content, live preview, generate the nested ZIP of 6"×4" PDFs (one per product×DC). DD Discount pulls fields from SKU Master |
| **Bill of Lading** | `bol/BolTab.tsx` | Full BOL form (+ `OrdersTable` for Page 1/2 orders), "Sync from Summary", editable or static PDF, preview + download. **Generating the BOL saves the whole shipment to History** |
| **Amazon API** | `amazon/AmazonTab.tsx` | Edit listings (price/qty per SKU per marketplace) and request SP-API reports. Shows a connected/not-configured status banner |
| **History** | `history/HistoryTab.tsx` | Search by PO number (or trailing digits), filter/sort, recall a shipment into the workspace, re-download labels, download/edit the BOL, export to Excel, delete (admin) |
| **SKU Master** | `skuMaster/SkuMasterTab.tsx` | Spreadsheet-style catalogue of every SKU's dimensions, weights, UPCs and case/pallet specs; inline edit, bulk Excel import, template download. Editing is admin-only |
| **Settings** | `settings/SettingsTab.tsx` | Admin-only user management — create/edit/delete users, set role + per-tab permissions, reset passwords |

---

## 7. State: the Zustand store

`src/store/useShipmentStore.ts` is the single source of truth, persisted to
`localStorage` (currently schema version 6, with forward migrations).

It holds:

- `activeBrand` / `activeTab` — current selections.
- `brandState: Record<BrandKey, ShipmentState>` — **isolated routing state per
  brand** (products, DCs, quantities, PO, sender, and optional burlington/sierra
  sub-state).
- `format: LabelFormat` — label editor inputs (**shared** across brands).
- `bol: BolForm` + `bolBrand` — the BOL form (shared), and the brand its Ship-To
  was last initialised for (so switching to Burlington/DD Discount swaps the
  Ship-To once, without clobbering in-progress edits on every render).
- `dataVersion` — bumped after every Supabase write so the History tab re-fetches
  automatically.

Key actions: brand/tab setters, routing mutators (`setPO`, `addDC`, `setQty`,
`loadParsedSheet`, …), `setFormat`, `setBol` / `setBolOrders`,
`setBurlington` / `setSierra`, `loadRecord` (restore a saved shipment, merged
with defaults), and `bumpDataVersion`.

---

## 8. Persistence & the database

Supabase Postgres holds two tables (schema in `supabase/schema.sql`):

### `po_records` — shipment history

Each row is a **complete snapshot** of one shipment, so it can be reproduced
exactly — labels and BOL included — long after the fact. Notable columns:
`po_number`, `po_digits` (for trailing-digit search), `brand`, and three JSONB
blobs — `shipment_state`, `label_format`, `bol_form` — plus a computed `summary`,
`label_total`, `total_pallets`, `bol_number`, timestamps and `created_by` /
`created_by_username`.

- Unique on `(po_number, brand)` → `savePoRecord()` upserts.
- Indexed on `po_digits` and `updated_at`; an `updated_at` trigger keeps the
  timestamp fresh.
- RLS: any authenticated user has full access.

### `sku_master` — SKU catalogue

A ~40-column central record of every SKU's identity, packaging, unit/case/pallet
dimensions (cm **and** inches), weights, and UPC/GTIN codes (stored as text to
preserve leading zeros). Unique on `item_code` (case-insensitive in the app).
This feeds the DD Discount label template.

---

## 9. Authentication & authorization

- **Auth:** Supabase Auth. `src/middleware.ts` (via `lib/supabase/middleware.ts`)
  refreshes the session on every navigation, gates everything behind login, and
  redirects: signed-out → `/login`, signed-in-on-login → `/dashboard`.
- **Login:** the form accepts a username and appends `@quikt.local` automatically
  (a full email also works). Default seeded login is **`admin` / `admin123`**.
- **Roles:** `admin` or `operator`, stored in Supabase `user_metadata` (no extra
  table). Admins implicitly have every permission.
- **Permissions:** operators get 7 per-tab toggles (`canDashboard`, `canRouting`,
  `canLabels`, `canBol`, `canAmazon`, `canHistory`, `canSkuMaster`) — defaulting
  to everything except Amazon.
- **Enforcement:** UI hides/disables nav by permission; admin API routes call
  `requireAdmin()`; the database adds RLS on top.

---

## 10. API routes (`src/app/api/`)

| Route | Method(s) | Purpose |
|-------|-----------|---------|
| `/api/admin/users` | GET, POST | List / create users (admin-only) |
| `/api/admin/users/[id]` | GET, PATCH, DELETE | Fetch / update / delete a user |
| `/api/admin/users/[id]/password` | POST | Reset a user's password |
| `/api/amazon/status` | GET | Report which Amazon credentials/regions are configured |
| `/api/amazon/listings` | PATCH | Update a listing's price / quantity via SP-API |
| `/api/amazon/reports` | POST | Request an SP-API report |
| `/api/assistant` | POST | Proxy a chat to OpenRouter (key never reaches the browser) |

The Amazon and Assistant features are inert until their respective env vars exist
— by design.

---

## 11. How data flows (the core workflow)

```
Routing tab ─┐
             ├─ shared Zustand store (per-brand state + label format + BOL form)
Label tab  ──┤
             │
BOL tab ─────┴─▶ "Generate PDF & Save" ─▶ savePoRecord() ─▶ Supabase po_records
                                                              │
History tab ◀── searchPoRecords() ◀──────────────────────────┘
```

1. **Routing** — upload the Quikfoods sheet (`parseShipmentSheet` divides qty by
   10, auto-detects brand/DCs/PO), set PO + sender, review the auto Shipment
   Summary, and save.
2. **Labels** — edit format, preview, generate the nested ZIP of 6"×4" PDFs.
3. **BOL** — "Sync from Summary" to auto-fill handling units / commodity / orders,
   finish the form, then "Generate PDF & Save" → downloads the BOL **and** writes
   the full shipment snapshot to `po_records`.
4. **History** — search by PO, recall into the workspace (`loadRecord` restores
   everything), re-download labels, download/edit the BOL, or export to Excel.

**Special brands:** Burlington / DD Discount use the line-item `SimplePoRouting`
form and a dedicated `syncBolFromBurlington` (Burlington auto-fills a fixed
Ship-To; Burlington skips labels). Sierra uses the `SierraRouting` matrix and
`syncBolFromSierra`. Both are adapted into a standard `ShipmentState` for label /
BOL generation.

---

## 12. Where to start

- **Setup & deploy:** `README.md` (Supabase schema, admin seed, env vars, Vercel).
- **Rules before editing:** `CLAUDE.md` — especially "the shipment math is ported
  verbatim and must not be changed."
- **The math:** `src/lib/formulas.ts`, `src/lib/constants.ts`.
- **The state that ties tabs together:** `src/store/useShipmentStore.ts`.
- **The single page that hosts everything:** `src/components/DashboardTabs.tsx`.
```
