// Self-check for the SKU weight/price lookup in computeSummary().
// Run: node scripts/check-sku-lookup.mjs
//
// Guards the HomeGoods routing bug: hand-typed SKUs like QT26L / QT27L / QT54L
// missed every lookup table, fell through to `|| 0`, and silently zeroed their
// contribution to Net Wt / Gross Wt / Value while cases + pallets still looked
// correct — so the summary read as plausible but the money line was short.
import assert from "node:assert/strict";
import { computeSummary } from "../src/lib/formulas.ts";
import { skuBase, B29 } from "../src/lib/constants.ts";

const dc = { num: "882", code: "HG882", name: "HomeGoods", street: "", city: "" };

const state = (products, qty) => ({
  products,
  dcs: [dc],
  qty,
  qtyFinalTotal: {},
  skuMeta: {},
});

// ── skuBase: only strips trailing letters, never touches a plain code ──
assert.equal(skuBase("QT26L"), "QT26");
assert.equal(skuBase("QT54L"), "QT54");
assert.equal(skuBase("QT13L"), "QT13");
assert.equal(skuBase("QT26"), "QT26", "plain SKUs must pass through untouched");
assert.equal(skuBase("QT9"), "QT9");
assert.equal(skuBase("WEIRD"), "WEIRD", "non-QT codes are left alone");

// ── The actual bug: QT26L must weigh and cost the same as QT26 ──
{
  const plain = computeSummary(state(["QT26"], { QT26: { "882": 4 } }));
  const suffixed = computeSummary(state(["QT26L"], { QT26L: { "882": 4 } }));

  assert.equal(suffixed.tot.netWt, plain.tot.netWt, "QT26L net wt must match QT26");
  assert.equal(suffixed.tot.value, plain.tot.value, "QT26L value must match QT26");
  assert.ok(suffixed.tot.netWt > 0, "QT26L must not contribute 0 lb");
  assert.ok(suffixed.tot.value > 0, "QT26L must not contribute $0");

  // 4 cases × 10 units × 0.0517 lb, $1.95/unit — the numbers the tool lost.
  assert.ok(Math.abs(suffixed.tot.netWt - 2.068) < 1e-9);
  assert.equal(suffixed.tot.value, 78);
  assert.equal(suffixed.tot.grossWt, suffixed.tot.netWt + B29);
  assert.deepEqual(suffixed.unknownSkus, [], "a resolvable SKU is not unknown");
}

// ── QT54L / QT27L, same shape ──
for (const [suffixed, plain] of [["QT54L", "QT54"], ["QT27L", "QT27"]]) {
  const a = computeSummary(state([suffixed], { [suffixed]: { "882": 8 } }));
  const b = computeSummary(state([plain], { [plain]: { "882": 8 } }));
  assert.equal(a.tot.netWt, b.tot.netWt, `${suffixed} net wt must match ${plain}`);
  assert.equal(a.tot.value, b.tot.value, `${suffixed} value must match ${plain}`);
}

// ── 20ct bucketing must survive the suffix, or pallet counts skew ──
{
  const a = computeSummary(state(["QT13L"], { QT13L: { "882": 16 } }));
  const b = computeSummary(state(["QT13"], { QT13: { "882": 16 } }));
  assert.equal(a.tot.cases20, 16, "QT13L belongs in the 20ct bucket");
  assert.equal(a.tot.cases10, 0);
  assert.equal(a.tot.pallets, b.tot.pallets, "QT13L must not change the pallet count");
}

// ── An exact entry still wins over the base fallback ──
{
  const st = state(["QT26L"], { QT26L: { "882": 4 } });
  st.skuMeta = { QT26L: { price: 9.99, weight: 1 } };
  const s = computeSummary(st);
  assert.equal(s.tot.netWt, 40, "explicit skuMeta must override the base fallback");
  assert.equal(s.tot.value, 399.6);
}

// ── A genuinely unknown SKU is reported, not swallowed ──
{
  const s = computeSummary(state(["ZZ99"], { ZZ99: { "882": 5 } }));
  assert.deepEqual(s.unknownSkus, ["ZZ99"]);
  assert.equal(s.tot.netWt, 0, "unknown SKUs still contribute 0 — but now visibly");
  assert.equal(s.tot.totalCases, 5, "…while still counting toward cases");
}

// ── SKU Master fills in what the hard-coded tables don't know ──
// Rows shaped like sku_master (June 2026 values). QT26L is a "20 Count x 10"
// SKU there — 8×11 pallets like QT13, not QT26's 11×15.
const master = new Map([
  ["QT13", { item_code: "QT13", sachet_count: 20, case_pack: 10, case_gross_wt_lb: 13.117489 }],
  ["QT12", { item_code: "QT12", sachet_count: 10, case_pack: 10, case_gross_wt_lb: 7.165015 }],
  ["QT26L", { item_code: "QT26L", sachet_count: 20, case_pack: 10, case_gross_wt_lb: 9.259404 }],
  ["QT13C", { item_code: "QT13C", sachet_count: 20, case_pack: 10, case_gross_wt_lb: 11.464024 }],
  ["QT11", { item_code: "QT11", sachet_count: 2, case_pack: 20, case_gross_wt_lb: 3.1195373 }],
]);
{
  // Hard-coded SKUs: byte-identical with or without the master.
  for (const p of ["QT13", "QT12", "QT26"]) {
    const a = computeSummary(state([p], { [p]: { "882": 30 } }));
    const b = computeSummary(state([p], { [p]: { "882": 30 } }), master);
    assert.deepEqual(a.tot, b.tot, `${p} must not change when the master is present`);
  }

  // QT13C is not in any table: master → 20ct bucket, wt 11.464/100, $3.75.
  const s = computeSummary(state(["QT13C"], { QT13C: { "882": 16 } }), master);
  assert.equal(s.tot.cases20, 16, "QT13C is a 20 Count SKU per the master");
  assert.equal(s.tot.cases10, 0);
  assert.equal(s.tot.pallets, Math.ceil(((16 / 8) * 6) / 72));
  assert.ok(Math.abs(s.tot.netWt - 160 * 0.11464024) < 1e-9);
  assert.equal(s.tot.value, 600, "20ct price rule: $3.75/unit");
  assert.deepEqual(s.unknownSkus, []);

  // Without the master, QT13C still gets the skuBase() guess (QT13) as before.
  const g = computeSummary(state(["QT13C"], { QT13C: { "882": 16 } }));
  assert.equal(g.tot.cases20, 16);
  assert.ok(Math.abs(g.tot.netWt - 160 * 0.1375) < 1e-9);

  // Master beats the suffix guess: QT26L is 20ct in the master, not QT26.
  const l = computeSummary(state(["QT26L"], { QT26L: { "882": 4 } }), master);
  assert.equal(l.tot.cases20, 4, "master says QT26L is 20 Count");
  assert.ok(Math.abs(l.tot.netWt - 40 * 0.09259404) < 1e-9);
  assert.equal(l.tot.value, 150);

  // case_pack is NOT the bucket: QT11 is "2 Count x 20" — case_pack 20, sachet 2.
  const q = computeSummary(state(["QT11"], { QT11: { "882": 10 } }), master);
  assert.equal(q.tot.cases20, 0, "case_pack 20 must not land in the 20ct bucket");
  assert.equal(q.tot.cases10, 10);
  assert.equal(q.tot.value, 0, "no price rule for a 2-count SKU — stays $0, not guessed");
  assert.deepEqual(q.unknownSkus, [], "…but it has a weight, so it is not unknown");

  // Sheet skuMeta still beats the master.
  const st = state(["QT13C"], { QT13C: { "882": 1 } });
  st.skuMeta = { QT13C: { price: 9.99, weight: 1 } };
  const m = computeSummary(st, master);
  assert.equal(m.tot.netWt, 10);
  assert.equal(m.tot.value, 99.9);
}

console.log("✓ SKU lookup check passed");
