// Self-check for the Burlington / DD Discount → ShipmentState adapter.
// Run: node scripts/check-adapter.mjs
//
// Guards the exact bug that lost PO 80826835: DD Discount lines saved with a
// blank Suffix were silently dropped, so the Labels tab found no DCs and fell
// back to its placeholder (HomeGoods DC 882 / QT15 / qty 5).
import assert from "node:assert/strict";
import { burlingtonToShipmentState } from "../src/lib/burlingtonAdapter.ts";

const line = (over) => ({
  _id: "x",
  suffix: "",
  product: "QT12",
  origQty: 264,
  finalQty: 264,
  hi: 11,
  ...over,
});
const ship = (lines, headerPo = "80826835") => ({
  headerPo,
  startDate: "",
  endDate: "",
  lines,
  palletConstants: { cuFt: 6.7, wt: 80, maxHeight: 72 },
});

// ── DD Discount: blank suffix is legal (single DC) ──
{
  const st = burlingtonToShipmentState(ship([line()]), "fallback", "ddDiscount");
  assert.equal(st.dcs.length, 1, "blank suffix must still yield a DC");
  assert.deepEqual(st.products, ["QT12"]);
  assert.equal(st.qty.QT12[st.dcs[0].num], 264);
  assert.equal(st.dcs[0].name, "DD's Discount, East Coast DC");
  // Empty poPrefix ⇒ labelPdf/preview render the bare master PO.
  assert.equal(st.dcs[0].poPrefix, "", "no suffix ⇒ no PO prefix");
}

// ── DD Discount: a suffix, when present, still drives the DC + PO prefix ──
{
  const st = burlingtonToShipmentState(
    ship([line({ suffix: "24" })]),
    "fallback",
    "ddDiscount",
  );
  assert.equal(st.dcs.length, 1);
  assert.equal(st.dcs[0].num, "24");
  assert.equal(st.dcs[0].poPrefix, "24");
  assert.equal(st.qty.QT12["24"], 264);
}

// ── DD Discount: mixed lines don't collapse into one DC ──
{
  const st = burlingtonToShipmentState(
    ship([line({ suffix: "24" }), line({ _id: "y", product: "QT18" })]),
    "fallback",
    "ddDiscount",
  );
  assert.equal(st.dcs.length, 2, "suffixed and blank lines are distinct DCs");
  assert.deepEqual(st.products.sort(), ["QT12", "QT18"]);
}

// ── Burlington: blank suffix still drops the line (multi-DC brand) ──
{
  const st = burlingtonToShipmentState(ship([line()]), "fallback", "burlington");
  assert.equal(st.dcs.length, 0, "burlington must not invent a DC");
  assert.deepEqual(st.products, []);
}

// ── Both brands: zero qty and blank product are always dropped ──
{
  const st = burlingtonToShipmentState(
    ship([line({ suffix: "24", finalQty: 0 }), line({ _id: "z", suffix: "25", product: "" })]),
    "fallback",
    "ddDiscount",
  );
  assert.equal(st.dcs.length, 0);
}

console.log("✓ burlingtonToShipmentState — all checks passed");
