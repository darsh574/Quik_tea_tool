// ─────────────────────────────────────────────────────────────────────────────
// Zustand store — the single source of truth carried across the Routing,
// Label Generator and BOL tabs. Mirrors the original tool's brandState +
// label format inputs + BOL form, so a PO's details flow end to end.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  makeDefaultBrandState,
  BRAND_CONFIG,
  defaultBurlingtonShipment,
  defaultSierraShipment,
} from "@/lib/constants";
import { defaultBolForm } from "@/lib/bolHelpers";
import { defaultLabelFormat } from "@/lib/labelFormat";
import { poDigits } from "@/lib/formulas";
import type {
  BrandKey,
  TabKey,
  ShipmentState,
  LabelFormat,
  BolForm,
  BolOrder,
  DC,
  PoRecord,
  BurlingtonShipment,
  SierraShipment,
} from "@/lib/types";

// `defaultLabelFormat` lives in `@/lib/labelFormat` so both the store and
// `saveSimplePoRecord` can share the same canonical defaults.
const defaultFormat = defaultLabelFormat;

interface ShipmentStore {
  activeBrand: BrandKey;
  activeTab: TabKey;
  brandState: Record<BrandKey, ShipmentState>;
  format: LabelFormat;
  bol: BolForm;
  /**
   * The brand the current `bol.st_*` fields were last initialised for.
   * When `activeBrand` changes to a brand with custom Ship-To defaults
   * (Burlington / DD Discount), the Ship-To swaps automatically — but
   * only on a brand transition, so the user's in-progress edits aren't
   * silently overwritten on every render.
   */
  bolBrand: BrandKey;
  /**
   * Incremented after every Supabase write (save / delete). Components that
   * fetch PO records watch this in their useEffect deps so the list refreshes
   * automatically without manual re-fetching.
   */
  dataVersion: number;
  bumpDataVersion: () => void;

  // ── brand / tab / state selectors ──
  setActiveBrand: (brand: BrandKey) => void;
  setActiveTab: (tab: TabKey) => void;
  current: () => ShipmentState;

  // ── Routing tab (Setup) ──
  setPO: (po: string) => void;
  setFrom: (from: string) => void;
  addProduct: (prod: string) => void;
  removeProduct: (prod: string) => void;
  addDC: (dc: DC) => void;
  removeDC: (num: string) => void;
  setQty: (prod: string, dcNum: string, val: number) => void;
  loadParsedSheet: (parsed: {
    products: string[];
    dcs: DC[];
    qty: ShipmentState["qty"];
    skuMeta: ShipmentState["skuMeta"];
    sheetPO: string;
  }) => void;
  resetBrand: (brand?: BrandKey) => void;

  // ── Label Format tab ──
  setFormat: (patch: Partial<LabelFormat>) => void;

  // ── Burlington / DD Discount routing ──
  setBurlington: (patch: Partial<BurlingtonShipment>) => void;

  // ── Sierra routing ──
  setSierra: (patch: Partial<SierraShipment>) => void;

  // ── BOL tab ──
  setBol: (patch: Partial<BolForm>) => void;
  setBolOrders: (page: "p1Orders" | "p2Orders", orders: BolOrder[]) => void;

  // ── PO history ──
  loadRecord: (rec: PoRecord) => void;
}

export const useShipmentStore = create<ShipmentStore>()(
  persist(
    (set, get) => ({
      activeBrand: "homegoods",
      activeTab: "home",
      brandState: makeDefaultBrandState(),
      format: defaultFormat(),
      bol: defaultBolForm(),
      bolBrand: "homegoods",
      dataVersion: 0,
      bumpDataVersion: () => set((s) => ({ dataVersion: s.dataVersion + 1 })),

      // Brand selection only changes `activeBrand` — the BOL form is left
      // alone. Burlington / DD Discount Ship-To + routing totals are applied
      // exclusively when the user clicks "↺ Sync from Summary" on the BOL
      // tab, so nothing overwrites in-progress BOL edits silently.
      setActiveBrand: (brand) => set({ activeBrand: brand, bolBrand: brand }),
      setActiveTab: (tab) => set({ activeTab: tab }),

      current: () => get().brandState[get().activeBrand],

      setPO: (po) =>
        set((s) => {
          const brand = s.activeBrand;
          const next = { ...s.brandState, [brand]: { ...s.brandState[brand], po } };
          // Always keep the BOL "Shipment PO #" in sync with the routing PO.
          // Without this, a stale bol_po_number from an earlier sheet upload
          // would shadow the new PO at save time and Supabase's upsert
          // (po_number, brand) would overwrite the wrong row.
          const digits = poDigits(po);
          const bol = { ...s.bol, bol_po_number: digits };
          return { brandState: next, bol };
        }),

      setFrom: (from) =>
        set((s) => ({
          brandState: {
            ...s.brandState,
            [s.activeBrand]: { ...s.brandState[s.activeBrand], from },
          },
        })),

      addProduct: (prod) =>
        set((s) => {
          const v = prod.trim().toUpperCase();
          const st = s.brandState[s.activeBrand];
          if (!v || st.products.includes(v)) return s;
          const next: ShipmentState = {
            ...st,
            products: [...st.products, v],
            qty: { ...st.qty, [v]: st.qty[v] || {} },
          };
          return { brandState: { ...s.brandState, [s.activeBrand]: next } };
        }),

      removeProduct: (prod) =>
        set((s) => {
          const st = s.brandState[s.activeBrand];
          const next: ShipmentState = {
            ...st,
            products: st.products.filter((x) => x !== prod),
          };
          return { brandState: { ...s.brandState, [s.activeBrand]: next } };
        }),

      addDC: (dc) =>
        set((s) => {
          const st = s.brandState[s.activeBrand];
          if (st.dcs.find((d) => d.num === dc.num)) return s;
          const master = BRAND_CONFIG[s.activeBrand].dcMaster[dc.num];
          const defaultName = BRAND_CONFIG[s.activeBrand].defaultDCName;
          const resolved: DC = master
            ? { num: dc.num, ...master }
            : {
                num: dc.num,
                code: dc.code || dc.num,
                name: dc.name || defaultName,
                street: dc.street || "",
                city: dc.city || "",
                poPrefix: dc.poPrefix || "",
              };
          return {
            brandState: {
              ...s.brandState,
              [s.activeBrand]: { ...st, dcs: [...st.dcs, resolved] },
            },
          };
        }),

      removeDC: (num) =>
        set((s) => {
          const st = s.brandState[s.activeBrand];
          return {
            brandState: {
              ...s.brandState,
              [s.activeBrand]: { ...st, dcs: st.dcs.filter((d) => d.num !== num) },
            },
          };
        }),

      setQty: (prod, dcNum, val) =>
        set((s) => {
          const st = s.brandState[s.activeBrand];
          const qty = { ...st.qty, [prod]: { ...(st.qty[prod] || {}), [dcNum]: val } };
          return { brandState: { ...s.brandState, [s.activeBrand]: { ...st, qty } } };
        }),

      loadParsedSheet: (parsed) =>
        set((s) => {
          const st = s.brandState[s.activeBrand];
          const qtyFinalTotal: Record<string, number> = {};
          parsed.products.forEach((p) => {
            qtyFinalTotal[p] = Object.values(parsed.qty[p] || {}).reduce((a, v) => a + v, 0);
          });
          const next: ShipmentState = {
            ...st,
            products: parsed.products,
            dcs: parsed.dcs,
            qty: parsed.qty,
            qtyFinal: {},
            qtyFinalTotal,
            skuMeta: parsed.skuMeta,
            po: parsed.sheetPO ? parsed.sheetPO : st.po,
          };
          const digits = poDigits(next.po);
          const bol = digits ? { ...s.bol, bol_po_number: digits } : s.bol;
          return { brandState: { ...s.brandState, [s.activeBrand]: next }, bol };
        }),

      resetBrand: (brand) =>
        set((s) => {
          const b = brand || s.activeBrand;
          const fresh = makeDefaultBrandState();
          return { brandState: { ...s.brandState, [b]: fresh[b] } };
        }),

      setBurlington: (patch) =>
        set((s) => {
          const st = s.brandState[s.activeBrand];
          const current = st.burlington ?? defaultBurlingtonShipment();
          return {
            brandState: {
              ...s.brandState,
              [s.activeBrand]: { ...st, burlington: { ...current, ...patch } },
            },
          };
        }),

      setSierra: (patch) =>
        set((s) => {
          const st = s.brandState[s.activeBrand];
          const current = st.sierra ?? defaultSierraShipment();
          return {
            brandState: {
              ...s.brandState,
              [s.activeBrand]: { ...st, sierra: { ...current, ...patch } },
            },
          };
        }),

      setFormat: (patch) => set((s) => ({ format: { ...s.format, ...patch } })),

      setBol: (patch) => set((s) => ({ bol: { ...s.bol, ...patch } })),

      setBolOrders: (page, orders) => set((s) => ({ bol: { ...s.bol, [page]: orders } })),

      loadRecord: (rec) =>
        set((s) => ({
          activeBrand: rec.brand,
          bolBrand: rec.brand,
          brandState: { ...s.brandState, [rec.brand]: rec.shipment_state },
          // Same defensive merge as `bol` below — Burlington / DD Discount
          // records used to save `label_format: {}`, which would otherwise
          // strip `vendorLabel` / `dept` / etc. and produce labels with
          // "undefined" baked in.
          format: { ...defaultFormat(), ...(rec.label_format ?? {}) } as LabelFormat,
          // Merge over defaults so older records (saved with an empty `{}` for
          // `bol_form` — Burlington / DD Discount used to do this) don't
          // produce a bol missing required arrays like `p1Orders`. Without
          // this guard, OrdersTable.reduce() throws on the next render.
          bol: { ...defaultBolForm(), ...(rec.bol_form ?? {}) } as BolForm,
        })),
    }),
    {
      name: "quikt-shipment-store",
      // Persist everything so a refresh keeps the in-progress shipment.
      version: 6,
      // v1 → v2: extended BrandKey with burlington / sierra / ddDiscount.
      // v2 → v3: added the `burlington` field on ShipmentState for the
      // line-item routing flow + BOL sync. Backfill it for the two brands
      // that use it so the new fields exist on already-persisted state.
      // v3 → v4: heal `bol` shape — older Burlington saves wrote an empty
      // `bol_form: {}` and `loadRecord` then replaced the live BOL with that
      // empty object, knocking out `p1Orders` / `p2Orders` and crashing
      // OrdersTable's reduce() on the next render.
      // v4 → v5: heal `format` for the same reason — empty `label_format: {}`
      // made `f.vendorLabel` etc. undefined in `buildLabelElements` so labels
      // rendered as "undefined QT15" on Routing/Labels for any user who'd
      // loaded a Burlington record.
      migrate: (persisted, version) => {
        if (!persisted) return persisted;
        const p = persisted as Partial<ShipmentStore>;
        if (version < 2) {
          const defaults = makeDefaultBrandState();
          p.brandState = { ...defaults, ...(p.brandState ?? {}) } as Record<
            BrandKey,
            ShipmentState
          >;
        }
        if (version < 3 && p.brandState) {
          const bs = p.brandState;
          (["burlington", "ddDiscount"] as BrandKey[]).forEach((b) => {
            if (bs[b] && !bs[b].burlington) {
              bs[b] = { ...bs[b], burlington: defaultBurlingtonShipment() };
            }
          });
        }
        if (version < 4) {
          p.bol = { ...defaultBolForm(), ...(p.bol ?? {}) } as BolForm;
        }
        if (version < 5) {
          p.format = { ...defaultFormat(), ...(p.format ?? {}) } as LabelFormat;
        }
        if (version < 6 && p.brandState) {
          // v5 → v6: added the `sierra` field on ShipmentState for the
          // Sierra Trading Post routing matrix. Backfill it for the
          // sierra brand so the component's selector finds the field.
          const bs = p.brandState;
          if (bs.sierra && !bs.sierra.sierra) {
            bs.sierra = { ...bs.sierra, sierra: defaultSierraShipment() };
          }
        }
        return p;
      },
    }
  )
);
