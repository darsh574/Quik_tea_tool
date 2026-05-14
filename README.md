# QuikT Tool

Internal shipment dashboard for QuikTea / Quikfoods. Four workflow tabs —
**Routing → Label Generator → Bill of Lading → Amazon API** — plus a **History**
tab that recalls any past shipment by PO number.

All the original logic from `platform_updt.html` (the ÷10 Excel import, the
pallet / weight / value formulas, the 6"×4" label PDF spec, the AcroForm BOL
generator, the carrier address book, the 3 brand tabs) is ported **verbatim** —
no formula or constant was changed.

- **Framework:** Next.js 14 (App Router) + TypeScript
- **Backend / DB / Auth:** Supabase (Postgres + Auth)
- **Hosting:** Vercel (frontend + API routes) + Supabase (database)

---

## What's in here

| Tab | What it does |
|-----|--------------|
| **1 · Routing** | Upload the Quikfoods Excel/CSV (qty auto ÷10), set PO + sender, edit products / DCs / quantities, see the auto Shipment Summary. |
| **2 · Label Generator** | Edit label content, live preview, generate the nested ZIP of 6"×4" PDFs (one per product×DC). |
| **3 · Bill of Lading** | Full BOL form, "Sync from Summary", editable (AcroForm) or static PDF, preview + download. Generating the BOL **saves the whole shipment to History**. |
| **4 · Amazon API** | Amazon SP-API: edit listings (price/qty per SKU per marketplace) and pull reports. Credentials via env vars. |
| **History** | Search by PO number (or trailing digits). Recall a shipment months later, re-download labels, download or edit the BOL. |

Default login: **`admin`** / **`admin123`** (change it after first login).

---

## Prerequisites

- **Node.js 18.18+** (Node 20+ recommended)
- A **Supabase** account — <https://supabase.com>
- A **Vercel** account — <https://vercel.com>
- (Optional) An **OpenRouter** key for the AI help assistant — <https://openrouter.ai/keys>
- (Optional, later) Amazon **Selling Partner API** credentials from the brand's Seller Central

---

## 1 · Local setup

```bash
cd quikt-tool
npm install
cp .env.example .env.local      # then fill in the values (see step 2)
```

---

## 2 · Supabase setup (the backend)

### 2.1 Create the project
1. Go to <https://supabase.com/dashboard> → **New project**.
2. Name it `quikt-tool`, pick a region close to your users, set a strong DB password, **Create**.
3. Wait ~2 minutes for it to provision.

### 2.2 Create the database schema
1. In the project, open **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this repo, paste the whole file in, click **Run**.
3. It creates the `po_records` table (the PO history), its indexes, an
   `updated_at` trigger, and Row Level Security (any signed-in user has full access).

### 2.3 Get your API keys
1. Open **Project Settings → API**.
2. Copy these into `.env.local`:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` *(server-only — never expose this)*

### 2.4 Seed the admin user
With `.env.local` filled in, run:

```bash
node scripts/seed-admin.mjs
```

This creates the login **`admin`** / **`admin123`** (stored as `admin@quikt.local`
in Supabase Auth). To use different credentials, set `ADMIN_EMAIL` /
`ADMIN_PASSWORD` env vars before running, or create the user manually in
**Authentication → Users** (and tell users to log in with the email).

> The login screen accepts a username — it appends `@quikt.local` automatically.
> Typing a full email also works.

### 2.5 (Optional) Turn off public sign-ups
This is an internal tool. In **Authentication → Providers → Email**, you can
disable "Allow new users to sign up" so only seeded users can log in.

---

## 3 · Run it locally

```bash
npm run dev
```

Open <http://localhost:3000> → you'll be redirected to `/login`. Sign in with
`admin` / `admin123`.

Useful scripts:
- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run typecheck` — TypeScript check
- `npm run lint` — ESLint

---

## 4 · Deploy to Vercel (the frontend + API)

### 4.1 Push the code to a Git repo
The project is a normal Git repo. Create a repository on GitHub (suggested name:
**`quikt-tool`**) and push:

```bash
git init
git add .
git commit -m "QuikT Tool — initial dashboard"
git branch -M main
git remote add origin https://github.com/<your-org>/quikt-tool.git
git push -u origin main
```

> ⚠️ **Never commit `.env.local`** — it's already in `.gitignore`. If the GitHub
> token you used for setup was ever shared in plain text, **revoke it** and
> generate a fresh one (GitHub → Settings → Developer settings → Personal access
> tokens).

### 4.2 Import into Vercel
1. <https://vercel.com/new> → **Import** your `quikt-tool` repository.
2. Framework preset: **Next.js** (auto-detected). Leave build settings default.
3. **Before deploying**, open **Environment Variables** and add the same keys as
   `.env.local` (see the table below). Apply them to **Production**, **Preview**,
   and **Development**.
4. Click **Deploy**.

### 4.3 Environment variables (set these in Vercel)

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | From Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | From Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Server-only. Used by the admin-seed script / privileged routes |
| `OPENROUTER_API_KEY` | optional | Enables the AI help assistant. **Rotate the old leaked key.** |
| `OPENROUTER_MODEL` | optional | Defaults to `anthropic/claude-haiku-4-5` |
| `AMAZON_LWA_CLIENT_ID` | optional | Amazon SP-API — fill when the brand provides creds |
| `AMAZON_LWA_CLIENT_SECRET` | optional | Amazon SP-API |
| `AMAZON_REFRESH_TOKEN_NA` / `_EU` / `_FE` | optional | One refresh token per region |
| `AMAZON_USE_SANDBOX` | optional | `true` to hit the SP-API sandbox while testing |

### 4.4 Point Supabase at the deployed URL
After the first deploy, copy your Vercel URL (e.g. `https://quikt-tool.vercel.app`)
and in **Supabase → Authentication → URL Configuration** set:
- **Site URL** → your Vercel URL
- **Redirect URLs** → add your Vercel URL

Re-deploy is not needed — just save in Supabase. Subsequent pushes to `main`
auto-deploy.

---

## 5 · Amazon SP-API (optional, when the brand is ready)

The Amazon tab is fully scaffolded but inert until credentials exist. See
`Amazon-API-Integration-Summary.txt` in the parent folder for the full plan.
Short version of what the **brand** must do in Seller Central:

1. Register as a developer (Apps & Services → Develop Apps → Developer Profile).
2. Create a **private / draft** app — never publish it.
3. Pick the data roles: Product Listing, Pricing, Inventory & Order Tracking.
4. Authorize the app and **generate a refresh token** — once per region (NA/EU/FE).
5. Hand over: `client_id`, `client_secret`, and one refresh token per region.

Then add those as the `AMAZON_*` env vars (Vercel + `.env.local`). The tab's
status banner will flip to "Connected" automatically. Advertising / sponsored-
product reports use the separate **Amazon Advertising API** — wire that in later.

The implementation lives in:
- `src/lib/amazon/client.ts` — multi-region client, LWA token cache, retry-on-429
- `src/lib/amazon/regions.ts` — region endpoints + marketplace IDs
- `src/app/api/amazon/*` — auth-gated route handlers (status, listings, reports)

---

## 6 · How the data flows

```
Routing tab ─┐
             ├─ shared Zustand store (per-brand state + label format + BOL form)
Label tab  ──┤
             │
BOL tab ─────┴─▶ "Generate PDF & Save" ─▶ savePoRecord() ─▶ Supabase po_records
                                                              │
History tab ◀── searchPoRecords() ◀──────────────────────────┘
```

A PO record stores the **full** snapshot — shipment state, label format, BOL form
and computed summary — so a shipment can be reproduced exactly, labels and BOL
included, long after the fact.

---

## Project structure

```
quikt-tool/
├── supabase/schema.sql            # database schema — run once in Supabase
├── scripts/seed-admin.mjs         # one-time admin user seed
├── src/
│   ├── middleware.ts              # auth gate (redirects to /login)
│   ├── app/
│   │   ├── login/                 # login screen
│   │   ├── dashboard/             # routing / labels / bol / amazon / history
│   │   └── api/                   # amazon/* + assistant route handlers
│   ├── components/                # RoutingTab, LabelsTab, BolTab, HistoryTab, AmazonTab, …
│   ├── lib/
│   │   ├── constants.ts           # SPEC, DC masters, carrier book, SKU tables — verbatim
│   │   ├── formulas.ts            # pallet / weight / value math — verbatim
│   │   ├── excel.ts               # Quikfoods sheet parser (÷10, brand detect) — verbatim
│   │   ├── labelPdf.ts            # 6"×4" label PDF + ZIP — verbatim
│   │   ├── bolPdf.ts              # Bill of Lading PDF (editable + static) — verbatim
│   │   ├── bolHelpers.ts          # BOL defaults + Sync-from-Summary
│   │   ├── history.ts             # Supabase save / search
│   │   ├── supabase/              # browser + server clients
│   │   └── amazon/                # SP-API client + region map
│   └── store/useShipmentStore.ts  # Zustand store carried across tabs
```
