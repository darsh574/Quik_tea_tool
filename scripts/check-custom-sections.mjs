import assert from "node:assert/strict";
import { defaultLabelFormat } from "../src/lib/labelFormat.ts";
import { defaultCustomShipment, getBrandConfig, isMatrixBrand, makeDefaultBrandState } from "../src/lib/constants.ts";
import { sierraToShipmentState } from "../src/lib/sierraAdapter.ts";
import { buildLabelElementsSierra } from "../src/lib/formulas.ts";
import { generateLabelZip } from "../src/lib/labelPdf.ts";
import JSZip from "jszip";

// In-memory browser storage checks persistence without touching real shipments.
const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: key => memory.delete(key),
};
const { useShipmentStore: store } = await import("../src/store/useShipmentStore.ts");
const state = () => store.getState();
const original = structuredClone(state().brandState);
state().setFormat({ country: "Original country" });
state().setActiveBrand("lotless");
assert.equal(state().format.country, "Original country", "built-in shared format behavior is unchanged");
state().addSection("  Test   Retailer  ", { ...defaultLabelFormat(), dept: "Dept # 42", country: "Canada" });
const first = state().activeBrand;
assert.equal(first, "custom:Test Retailer");
assert.equal(getBrandConfig(first).label, "Test Retailer");
assert.ok(isMatrixBrand(first));
assert.equal(state().current().sierra.dcs.length, 1);
assert.equal(state().current().sierra.dcs[0].num, "");
assert.equal(state().current().sierra.dcs[0].name, "Test Retailer Distribution Center");
for (const name of ["", " ", "test retailer", "LOTLESS", "x".repeat(61)]) {
  assert.throws(() => state().addSection(name, defaultLabelFormat()));
}
const sierra = { ...state().current().sierra, poNumber: "R123456", from: "Test Sender",
  lines: [{ _id: "test", product: "QT15", orig: { "": 120 }, final: { "": 12 } }] };
state().setSierra(sierra);
state().addSection("Second Retailer", { ...defaultLabelFormat(), dept: "", country: "India" });
const second = state().activeBrand;
assert.equal(state().current().sierra.poNumber, "");
state().setFormat({ vendorLabel: "Item #" });
state().setActiveBrand(first);
assert.equal(state().format.country, "Canada");
assert.equal(state().current().sierra.poNumber, "R123456");
state().setActiveBrand("burlington");
assert.equal(state().format.country, "Original country");
state().setActiveBrand(second);
assert.equal(state().format.vendorLabel, "Item #");
assert.deepEqual(state().brandState.lotless, original.lotless, "Lotless shipment is untouched");
assert.deepEqual(state().brandState.sierra, original.sierra);

await store.persist.rehydrate();
assert.equal(state().activeBrand, second);
assert.equal(state().brandFormats[first].country, "Canada");
state().setActiveBrand(first);
const adapted = sierraToShipmentState(state().current().sierra);
assert.equal(adapted.qty.QT15[""], 12);
assert.equal(adapted.from, "Test Sender");
assert.equal(adapted.dcs[0].name, "Test Retailer Distribution Center");
const format = state().format;
const preview = buildLabelElementsSierra(adapted.from, adapted.dcs[0], adapted.po, "QT15", 12, 1, format, true);
assert.ok(preview.some(el => el.text === "PO # R123456 Dept # 42"));
const legacy = buildLabelElementsSierra(adapted.from, adapted.dcs[0], adapted.po, "QT15", 12, 1, format);
assert.ok(legacy.some(el => el.text === "PO # R123456"), "existing labels still omit department suffix");
const result = await generateLabelZip(first, adapted, format);
const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
const pdfs = Object.values(zip.files).filter(file => file.name.endsWith(".pdf"));
assert.equal(pdfs.length, 1);
const pdf = await pdfs[0].async("string");
assert.match(pdf, /\/Count 12\b/);
assert.ok(pdf.includes("PO # R123456 Dept # 42"));
assert.ok(pdf.includes("Test Retailer Distribution Center"));
assert.ok(pdf.includes("Country of Origin: Canada"));

// Recall from the shared PO list also recreates the tab on a fresh browser.
store.setState({ brandState: makeDefaultBrandState(), brandFormats: {} });
state().loadRecord({ brand: first, po_number: adapted.po, shipment_state: { ...adapted, sierra }, label_format: format, bol_form: {}, summary: null });
assert.equal(state().activeBrand, first);
assert.equal(state().current().sierra.from, "Test Sender");
assert.equal(state().format.dept, "Dept # 42");
state().resetBrand();
assert.deepEqual(state().current().sierra.dcs, defaultCustomShipment(first).sierra.dcs);
state().addSection("Popup Details", { ...format, unitsVal: "20", stock: "Yes", pretick: "Yes" }, {
  from: "Custom Sender", to: "Custom Warehouse", street: "1 Main St", city: "Newark, NJ 07101",
  poNumber: "NEW123", product: "qt12",
});
const popup = state().current().sierra;
assert.equal(popup.from, "Custom Sender");
assert.equal(popup.poNumber, "NEW123");
assert.equal(popup.dcs[0].name, "Custom Warehouse");
assert.equal(popup.dcs[0].street, "1 Main St");
assert.equal(popup.dcs[0].city, "Newark, NJ 07101");
assert.equal(popup.lines.length, 1);
assert.equal(popup.lines[0].product, "QT12");
assert.equal(state().format.unitsVal, "20");
assert.equal(state().format.stock, "Yes");
assert.equal(state().format.pretick, "Yes");
const popupBrand = state().activeBrand;
const builtinSnapshot = structuredClone(state().brandState.lotless);
state().deleteSection("lotless");
assert.deepEqual(state().brandState.lotless, builtinSnapshot, "built-in sections cannot be deleted");
state().deleteSection(first);
assert.equal(state().activeBrand, popupBrand, "deleting another section preserves the active section");
assert.equal(state().brandState[first], undefined);
assert.equal(state().brandFormats[first], undefined);
state().deleteSection(popupBrand);
assert.equal(state().activeBrand, "lotless");
assert.equal(state().bolBrand, "lotless");
assert.equal(state().format, state().builtInFormat);
assert.deepEqual(state().brandState.lotless, builtinSnapshot);
await store.persist.rehydrate();
assert.equal(state().brandState[popupBrand], undefined, "deleted sections stay removed after refresh");
state().addSection("Popup Details", defaultLabelFormat());
assert.equal(state().activeBrand, popupBrand, "a deleted section name can be reused");
console.log("Custom sections: creation, validation, isolation, persistence, PO recall, preview and 12-page PDF passed.");
