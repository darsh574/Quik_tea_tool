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
} from "@/lib/constants";
import { defaultBolForm, BURLINGTON_SHIP_TO } from "@/lib/bolHelpers";
import { poDigits } from "@/lib/formulas";

/**
 * Brand-specific Ship-To defaults. When the active brand changes, the BOL
 * Ship-To swaps to match. Brands not listed here use the original TJX-style
 * defaults from `defaultBolForm()`.
 */
const BRAND_SHIP_TO: Partial<
  Record<BrandKey, { st_name: string; st_location: string; st_address: string; st_csz: string }>
> = {
  burlington: { ...BURLINGTON_SHIP_TO },
  ddDiscount: { ...BURLINGTON_SHIP_TO },
};
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
} from "@/lib/types";

function defaultFormat(): LabelFormat {
  return {
    dept: "Dept # 51",
    vendorLabel: "Vendor Style #",
    unitsLabel: "Total Units:",
    unitsVal: "10",
    stock: "No",
    pretick: "No",
    country: "India",
  };
}

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

      setActiveBrand: (brand) =>
        set((s) => {
          if (s.bolBrand === brand) return { activeBrand: brand };
          // Brand transitioned — swap Ship-To to the new brand's defaults so
          // the BOL tab is correct for the brand the user picked. Other BOL
          // fields (Ship-From, carrier, BOL #, etc.) are left intact.
          const def = defaultBolForm();
          const shipTo = BRAND_SHIP_TO[brand] ?? {
            st_name: def.st_name,
            st_location: def.st_location,
            st_address: def.st_address,
            st_csz: def.st_csz,
          };
          return {
            activeBrand: brand,
            bolBrand: brand,
            bol: { ...s.bol, ...shipTo },
          };
        }),
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

      setFormat: (patch) => set((s) => ({ format: { ...s.format, ...patch } })),

      setBol: (patch) => set((s) => ({ bol: { ...s.bol, ...patch } })),

      setBolOrders: (page, orders) => set((s) => ({ bol: { ...s.bol, [page]: orders } })),

      loadRecord: (rec) =>
        set((s) => ({
          activeBrand: rec.brand,
          bolBrand: rec.brand,
          brandState: { ...s.brandState, [rec.brand]: rec.shipment_state },
          format: rec.label_format,
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
      version: 4,
      // v1 → v2: extended BrandKey with burlington / sierra / ddDiscount.
      // v2 → v3: added the `burlington` field on ShipmentState for the
      // line-item routing flow + BOL sync. Backfill it for the two brands
      // that use it so the new fields exist on already-persisted state.
      // v3 → v4: heal `bol` shape — older Burlington saves wrote an empty
      // `bol_form: {}` and `loadRecord` then replaced the live BOL with that
      // empty object, knocking out `p1Orders` / `p2Orders` and crashing
      // OrdersTable's reduce() on the next render.
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
        return p;
      },
    }
  )
);
