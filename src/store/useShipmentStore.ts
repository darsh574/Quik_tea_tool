// ─────────────────────────────────────────────────────────────────────────────
// Zustand store — the single source of truth carried across the Routing,
// Label Generator and BOL tabs. Mirrors the original tool's brandState +
// label format inputs + BOL form, so a PO's details flow end to end.
// ─────────────────────────────────────────────────────────────────────────────

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { makeDefaultBrandState, BRAND_CONFIG } from "@/lib/constants";
import { defaultBolForm } from "@/lib/bolHelpers";
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
      activeTab: "routing",
      brandState: makeDefaultBrandState(),
      format: defaultFormat(),
      bol: defaultBolForm(),

      setActiveBrand: (brand) => set({ activeBrand: brand }),
      setActiveTab: (tab) => set({ activeTab: tab }),

      current: () => get().brandState[get().activeBrand],

      setPO: (po) =>
        set((s) => {
          const brand = s.activeBrand;
          const next = { ...s.brandState, [brand]: { ...s.brandState[brand], po } };
          // Mirror the trailing PO digits into the BOL "Shipment PO #" field
          // only when it is still empty (matches loadStateToForm()).
          const digits = poDigits(po);
          const bol =
            !s.bol.bol_po_number && digits ? { ...s.bol, bol_po_number: digits } : s.bol;
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

      setFormat: (patch) => set((s) => ({ format: { ...s.format, ...patch } })),

      setBol: (patch) => set((s) => ({ bol: { ...s.bol, ...patch } })),

      setBolOrders: (page, orders) => set((s) => ({ bol: { ...s.bol, [page]: orders } })),

      loadRecord: (rec) =>
        set((s) => ({
          activeBrand: rec.brand,
          brandState: { ...s.brandState, [rec.brand]: rec.shipment_state },
          format: rec.label_format,
          bol: rec.bol_form,
        })),
    }),
    {
      name: "quikt-shipment-store",
      // Persist everything so a refresh keeps the in-progress shipment.
      version: 1,
    }
  )
);
