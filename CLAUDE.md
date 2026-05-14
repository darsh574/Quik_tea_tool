# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**QuikT Tool** — an internal shipment dashboard for QuikTea / Quikfoods. It is a
faithful port of a single-file prototype (`platform_updt.html`, kept in the
parent folder) into a real app: Next.js 14 (App Router) + TypeScript, Supabase
(Postgres + Auth), deployed on Vercel.

Workflow tabs: **Routing → Label Generator → Bill of Lading → Amazon API**, plus
a **History** tab. Data flows by PO: generating the BOL saves the full shipment
snapshot to Supabase, recallable later by PO number.

## ⚠️ The most important rule

**The shipment math is ported VERBATIM from `platform_updt.html` and must not be
changed.** The brand derived these formulas and constants from their own research
and Excel sheets. Do not "simplify", "fix", or "tidy" any number, rounding step,
or constant in:

- `src/lib/constants.ts` — `SPEC`, the 3 DC masters, `BRAND_CONFIG`,
  `DEFAULT_SKU_META`, `CARRIER_BOOK`, pallet constants (`C23=8`, `B27=72`,
  `B29=80`, …), `SKU_WEIGHTS`, `SKU_PRICES`, default brand state, `DEFAULT_P1/P2`
- `src/lib/formulas.ts` — `computeFinalQty`, `computeSummary`, `buildLabelElements`
- `src/lib/excel.ts` — the ÷10 import + brand auto-detection
- `src/lib/labelPdf.ts` — the 6"×4" label PDF spec
- `src/lib/bolPdf.ts` — the AcroForm Bill of Lading generator
- `src/lib/bolHelpers.ts` — BOL defaults + `syncBolFromSummary`

Quirks that are intentional (do not "correct" them): `QT54` final total is `40`
(half of 80); rounding is `Math.ceil` for Net/Gross Wt and Value; quantities are
÷10 on import because the sheet stores ×10 the real carton count; the BOL
"Shipper Info" prefix is `TJM` while the label PDF-file prefix is `TJX`.

If a calculation genuinely looks wrong, surface it to the user — do not silently
change it.

## Commands

```bash
npm run dev         # local dev server (localhost:3000)
npm run build       # production build — must stay green
npm run typecheck   # tsc --noEmit — must stay green
npm run lint        # eslint
node scripts/seed-admin.mjs   # one-time: seed the admin user (needs .env.local)
```

Always run `npm run typecheck` (and ideally `npm run build`) after changes.

## Architecture

- **State**: a single Zustand store (`src/store/useShipmentStore.ts`) holds
  per-brand shipment state + the label format + the BOL form, and is persisted
  to `localStorage`. This is what carries a PO's data across the Routing, Labels
  and BOL tabs.
- **Auth**: Supabase Auth. `src/middleware.ts` gates everything under
  `/dashboard` and redirects to `/login`. Server code uses
  `src/lib/supabase/server.ts`; client code uses `src/lib/supabase/client.ts`.
- **Persistence**: `src/lib/history.ts` upserts/searches the `po_records` table.
  Schema is `supabase/schema.sql` (run once in the Supabase SQL Editor).
- **Amazon SP-API**: `src/lib/amazon/` is a server-only multi-region client
  (LWA token cache, retry-on-429). Route handlers in `src/app/api/amazon/*` are
  auth-gated. It is inert until the `AMAZON_*` env vars are set — by design.
- **AI assistant**: `src/app/api/assistant/route.ts` proxies OpenRouter
  server-side (key never reaches the browser). UI is `AssistantWidget.tsx`.

### Layout

```
src/app/dashboard/{routing,labels,bol,amazon,history}/page.tsx  → thin wrappers
src/components/{routing,labels,bol,history,amazon}/             → the tab UIs
src/components/{DashboardChrome,SummaryTable,AssistantWidget}.tsx
src/lib/                                                       → ported logic + supabase + amazon
```

The `page.tsx` files are intentionally tiny — all UI lives in `src/components/`.

## Conventions

- All tab UIs are `"use client"` components; the `page.tsx` wrappers are server
  components.
- PDF/Excel libs (`jspdf`, `jszip`, `xlsx`) run **client-side only**.
- `xlsx` is in `serverComponentsExternalPackages` in `next.config.mjs`.
- Brand-themed styling lives in `src/app/globals.css` (CSS variables + ported
  component classes). Tailwind is available but the panels use the ported CSS.
- Anything secret is a non-`NEXT_PUBLIC_` env var, read server-side only.

## Environment

Copy `.env.example` → `.env.local`. Required: the three `NEXT_PUBLIC_SUPABASE_*`
/ `SUPABASE_SERVICE_ROLE_KEY` values. Optional: `OPENROUTER_API_KEY`, the
`AMAZON_*` set. The same vars must be set in Vercel for production.

`.env.local` is gitignored — never commit secrets. Default login after seeding:
`admin` / `admin123`.

## Deploy

Supabase hosts the DB/Auth; Vercel hosts the app (frontend + API routes). See
`README.md` for the full step-by-step (schema, seed, env vars, Vercel import,
Supabase Auth URL config).
