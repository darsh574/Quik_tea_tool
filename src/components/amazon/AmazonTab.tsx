"use client";

import { useEffect, useMemo, useState } from "react";
import { MARKETPLACES } from "@/lib/amazon/regions";
import { listSkuMaster } from "@/lib/skuMaster";
import type { SkuMasterRow } from "@/lib/types";

interface ConfigStatus {
  hasClientCreds: boolean;
  regions: { NA: boolean; EU: boolean; FE: boolean };
  sandbox: boolean;
  configured: boolean;
}

// Common SP-API report types. Advertising ("advertised product") reports come
// from the separate Amazon Advertising API — noted in the UI.
const REPORT_TYPES = [
  { value: "GET_SALES_AND_TRAFFIC_REPORT", label: "Sales & Traffic" },
  { value: "GET_MERCHANT_LISTINGS_ALL_DATA", label: "All Listings" },
  { value: "GET_FBA_INVENTORY_PLANNING_DATA", label: "FBA Inventory Planning" },
  { value: "GET_LEDGER_SUMMARY_VIEW_DATA", label: "Inventory Ledger Summary" },
  { value: "GET_V2_SETTLEMENT_REPORT_DATA_FLAT_FILE", label: "Settlement Report" },
  { value: "GET_FBA_FULFILLMENT_REMOVAL_ORDER_DETAIL_DATA", label: "FBA Removal Orders" },
];

// ── Pallet & Weight Counter ──
// Math is ported from the Burlington / Home Goods routing (SimplePoRouting):
//   layers = qty ÷ Ti (pallet Ti from SKU Master)
//   stack height = layers × case height (in)
//   Pallet Count = ROUNDUP( Σ stack height ÷ 72 in , 0 )
//   Weight = Σ (qty × case gross wt) + pallet wt × Pallet Count
// The per-pallet box limits (88 for 20 CT, 165 for 10 CT) fall out of the
// height cap: Ti × Hi boxes = Hi layers × case height ≈ 72 in.
const COUNTER_PALLET_WT = 80; // lb per pallet — same default as routing
const COUNTER_MAX_HEIGHT = 72; // in, max stack height per pallet

// ponytail: specs come from the first SKU Master row of each sachet-count size —
// all 20 CT (and all 10 CT) cartons share the same dims/weight in the sheet.
// NOTE: "20 CT / 10 CT" is the Sachet count column, NOT Case Pack (that's the
// cartons-per-case "x 10" and is 10 for nearly every SKU).
function specFor(skus: SkuMasterRow[], sachetCount: number): SkuMasterRow | undefined {
  return skus.find(
    (s) =>
      s.sachet_count === sachetCount &&
      (s.pallet_ti ?? 0) > 0 &&
      (s.case_height_in ?? 0) > 0 &&
      (s.case_gross_wt_lb ?? 0) > 0,
  );
}

function fmt(n: number, digits = 0): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  return Number(n.toFixed(digits)).toLocaleString(undefined, {
    maximumFractionDigits: digits,
  });
}

export default function AmazonTab() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [statusErr, setStatusErr] = useState("");

  // ── Pallet & Weight counter state ──
  const [qty20, setQty20] = useState<number | "">("");
  const [qty10, setQty10] = useState<number | "">("");
  const [palletWt, setPalletWt] = useState(COUNTER_PALLET_WT);
  const [maxHeight, setMaxHeight] = useState(COUNTER_MAX_HEIGHT);
  const [skus, setSkus] = useState<SkuMasterRow[]>([]);
  const [skuErr, setSkuErr] = useState("");

  useEffect(() => {
    listSkuMaster()
      .then(setSkus)
      .catch((e) =>
        setSkuErr(e instanceof Error ? e.message : "Failed to load SKU Master."),
      );
  }, []);

  const counter = useMemo(() => {
    const spec20 = specFor(skus, 20);
    const spec10 = specFor(skus, 10);
    const perRow = [
      { label: "20 CT", spec: spec20, qty: typeof qty20 === "number" ? qty20 : 0 },
      { label: "10 CT", spec: spec10, qty: typeof qty10 === "number" ? qty10 : 0 },
    ].map((r) => {
      const ti = r.spec?.pallet_ti ?? 0;
      const hi = r.spec?.pallet_hi ?? 0;
      const layers = ti > 0 ? r.qty / ti : 0;
      const stackHeight = layers * (r.spec?.case_height_in ?? 0);
      // Boxes per pallet = the SKU Master "Cases/Pallet" column (= Ti × Hi).
      const perPallet = r.spec?.pallet_cases_per_pallet || ti * hi;
      return { ...r, weight: r.qty * (r.spec?.case_gross_wt_lb ?? 0), stackHeight, perPallet };
    });
    const totalQty = perRow.reduce((a, r) => a + r.qty, 0);
    const sumWeight = perRow.reduce((a, r) => a + r.weight, 0);
    const sumStack = perRow.reduce((a, r) => a + r.stackHeight, 0);
    // A pallet is full at whichever comes first: 72 in of stacked cartons
    // (Case "Height (in)" column) or the Cases/Pallet limit (88 / 165).
    const palletFraction = perRow.reduce(
      (a, r) => a + (r.perPallet > 0 ? r.qty / r.perPallet : 0),
      0,
    );
    const pallets = Math.ceil(
      Math.max(maxHeight > 0 ? sumStack / maxHeight : 0, palletFraction),
    );
    const weight = sumWeight + palletWt * pallets;
    return { perRow, spec20, spec10, totalQty, pallets, weight };
  }, [skus, qty20, qty10, palletWt, maxHeight]);

  // ── Listings editor state ──
  const [sellerId, setSellerId] = useState("");
  const [sku, setSku] = useState("");
  const [mpCode, setMpCode] = useState("US");
  const [price, setPrice] = useState("");
  const [qty, setQty] = useState("");
  const [listingMsg, setListingMsg] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [listingBusy, setListingBusy] = useState(false);

  // ── Reports state ──
  const [reportType, setReportType] = useState(REPORT_TYPES[0].value);
  const [reportMp, setReportMp] = useState("US");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reportMsg, setReportMsg] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const [reportBusy, setReportBusy] = useState(false);

  useEffect(() => {
    fetch("/api/amazon/status")
      .then((r) => r.json())
      .then((d) => (d.error ? setStatusErr(d.error) : setStatus(d)))
      .catch(() => setStatusErr("Could not reach the status endpoint."));
  }, []);

  async function submitListing() {
    setListingMsg(null);
    if (!sellerId || !sku) {
      setListingMsg({ kind: "err", msg: "Seller ID and SKU are required." });
      return;
    }
    const patches: Array<{ op: string; path: string; value: unknown }> = [];
    if (price.trim()) {
      patches.push({
        op: "replace",
        path: "/attributes/purchasable_offer",
        value: [{ our_price: [{ schedule: [{ value_with_tax: Number(price) }] }] }],
      });
    }
    if (qty.trim()) {
      patches.push({
        op: "replace",
        path: "/attributes/fulfillment_availability",
        value: [{ fulfillment_channel_code: "DEFAULT", quantity: Number(qty) }],
      });
    }
    if (!patches.length) {
      setListingMsg({ kind: "err", msg: "Enter a new price and/or quantity to update." });
      return;
    }
    setListingBusy(true);
    try {
      const res = await fetch("/api/amazon/listings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sellerId, sku, marketplaceCode: mpCode, patches }),
      });
      const data = await res.json();
      if (!res.ok) {
        setListingMsg({ kind: "err", msg: data.error || "Update failed." });
      } else {
        setListingMsg({ kind: "ok", msg: `✓ Submitted update for ${sku} in ${mpCode}.` });
      }
    } catch {
      setListingMsg({ kind: "err", msg: "Network error calling the listings endpoint." });
    } finally {
      setListingBusy(false);
    }
  }

  async function submitReport() {
    setReportMsg(null);
    setReportBusy(true);
    try {
      const res = await fetch("/api/amazon/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportType,
          marketplaceCodes: [reportMp],
          dataStartTime: startDate ? new Date(startDate).toISOString() : undefined,
          dataEndTime: endDate ? new Date(endDate).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReportMsg({ kind: "err", msg: data.error || "Report request failed." });
      } else {
        setReportMsg({
          kind: "ok",
          msg: `✓ Report queued — reportId ${data.reportId} (region ${data.region}). Poll GET /api/amazon/reports?region=${data.region}&reportId=${data.reportId} until DONE, then fetch the document.`,
        });
      }
    } catch {
      setReportMsg({ kind: "err", msg: "Network error calling the reports endpoint." });
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .az-counter-table {
              border-collapse: collapse; width: 100%; max-width: 720px;
              font-size: 13px; font-variant-numeric: tabular-nums;
            }
            .az-counter-table th {
              padding: 8px 10px; background: #f6f3ec; color: #5a6370;
              font-size: 10.5px; font-weight: 700; letter-spacing: 0.04em;
              text-transform: uppercase; text-align: left;
              border: 1px solid #e6e0d4;
            }
            .az-counter-table th.num, .az-counter-table td.num { text-align: right; }
            .az-counter-table td {
              padding: 4px 8px; border: 1px solid #e6e0d4; color: #25303f;
            }
            .az-counter-table td.derived { background: #fafaf5; font-weight: 600; }
            .az-counter-table input {
              width: 100%; padding: 6px 8px; border: 1.5px solid transparent;
              border-radius: 6px; background: #f6f3ec; font-size: 13px;
              color: #25303f; font-family: inherit; outline: none;
              font-variant-numeric: tabular-nums;
              transition: border-color 0.12s, background 0.12s;
            }
            .az-counter-table input:focus {
              border-color: #0e3a66; background: #fff;
              box-shadow: 0 0 0 2px rgba(14,58,102,0.1);
            }
            .az-counter-table input[type="number"] { text-align: right; }
            .az-counter-totals {
              display: flex; gap: 14px; flex-wrap: wrap; margin-top: 16px;
            }
            .az-counter-stat {
              flex: 1; min-width: 150px; padding: 14px 18px;
              background: #f6f3ec; border: 1px solid #e6e0d4; border-radius: 12px;
            }
            .az-counter-stat .lbl {
              font-size: 10.5px; font-weight: 700; letter-spacing: 0.4px;
              text-transform: uppercase; color: #6e6960;
            }
            .az-counter-stat .val {
              font-size: 24px; font-weight: 700; color: #0e3a66; margin-top: 4px;
              font-variant-numeric: tabular-nums;
            }
            .az-counter-stat.accent { background: #0e3a66; border-color: #0e3a66; }
            .az-counter-stat.accent .lbl { color: #b9c9db; }
            .az-counter-stat.accent .val { color: #fff; }
            .az-counter-consts {
              display: flex; gap: 18px; flex-wrap: wrap; align-items: center;
              margin-top: 14px; font-size: 12px; color: #6e6960;
            }
            .az-counter-consts input {
              width: 70px; padding: 5px 8px; border: 1.5px solid #d6ccb8;
              border-radius: 6px; background: #f6f3ec; font-size: 12.5px;
              text-align: right; font-family: inherit; outline: none;
              font-variant-numeric: tabular-nums;
            }
            details.az-legacy { margin-top: 4px; }
            details.az-legacy > summary {
              cursor: pointer; list-style: none;
              padding: 14px 20px; background: #fff;
              border: 1px solid #e6e0d4; border-radius: 14px;
              font-weight: 700; font-size: 14px; color: #1a2a3a;
              user-select: none;
            }
            details.az-legacy > summary::before { content: "▸ "; color: #e8593c; }
            details.az-legacy[open] > summary::before { content: "▾ "; }
            details.az-legacy[open] > summary {
              border-radius: 14px 14px 0 0; border-bottom: none;
            }
          `,
        }}
      />

      {/* ── Pallet & Weight Counter ── */}
      <div className="card first">
        <div className="section-title">Pallet &amp; Weight Counter</div>
        <p className="hint" style={{ marginBottom: 12 }}>
          Enter the 20 CT and 10 CT carton counts — pallet count and weight are computed
          with the same math as the Home Goods / Burlington routing. The SKU Master drives
          the per-case height, Ti and gross weight; a pallet is full at {fmt(maxHeight)}″
          of stacked cartons.
        </p>

        {skuErr && <div className="upload-status err" style={{ display: "block" }}>{skuErr}</div>}
        {!skuErr && skus.length === 0 && (
          <p className="hint">No SKUs in the catalogue yet — add them on the SKU Master tab.</p>
        )}
        {skus.length > 0 && !counter.spec20 && (
          <div className="upload-status err" style={{ display: "block" }}>
            No 20 CT SKU with pallet Ti, case height &amp; gross weight found in the SKU
            Master — 20 CT cartons can&apos;t be computed.
          </div>
        )}
        {skus.length > 0 && !counter.spec10 && (
          <div className="upload-status err" style={{ display: "block" }}>
            No 10 CT SKU with pallet Ti, case height &amp; gross weight found in the SKU
            Master — 10 CT cartons can&apos;t be computed.
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table className="az-counter-table">
            <thead>
              <tr>
                <th>Pack</th>
                <th className="num" style={{ width: 140 }}>Count (cartons)</th>
                <th className="num" style={{ width: 130 }}>Boxes / pallet</th>
                <th className="num" style={{ width: 120 }}>Weight (lb)</th>
              </tr>
            </thead>
            <tbody>
              {counter.perRow.map((r, i) => (
                <tr key={r.label}>
                  <td style={{ fontWeight: 600 }} title={r.spec?.item_code ?? ""}>
                    {r.label}
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      min={0}
                      value={i === 0 ? qty20 : qty10}
                      onChange={(e) => {
                        const v =
                          e.target.value === "" ? ("" as const) : parseInt(e.target.value, 10) || 0;
                        (i === 0 ? setQty20 : setQty10)(v);
                      }}
                    />
                  </td>
                  <td className="num derived">{fmt(r.perPallet)}</td>
                  <td className="num derived">{fmt(r.weight)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="az-counter-totals">
          <div className="az-counter-stat">
            <div className="lbl">Total Qty</div>
            <div className="val">{fmt(counter.totalQty)}</div>
          </div>
          <div className="az-counter-stat accent">
            <div className="lbl">Pallet Count</div>
            <div className="val">{fmt(counter.pallets)}</div>
          </div>
          <div className="az-counter-stat accent">
            <div className="lbl">Weight (lb)</div>
            <div className="val">{fmt(counter.weight)}</div>
          </div>
        </div>

        <div className="az-counter-consts">
          <span>
            Pallet wt (lb){" "}
            <input
              type="number"
              min={0}
              value={palletWt || ""}
              onChange={(e) => setPalletWt(parseFloat(e.target.value) || 0)}
            />
          </span>
          <span>
            Max pallet height (in){" "}
            <input
              type="number"
              min={0}
              value={maxHeight || ""}
              onChange={(e) => setMaxHeight(parseFloat(e.target.value) || 0)}
            />
          </span>
          <span>Weight includes {fmt(palletWt)} lb per pallet, same as routing.</span>
        </div>
      </div>

      {/* ── Legacy SP-API tools — collapsed by default ── */}
      <details className="az-legacy">
        <summary>Amazon SP-API tools — connection, listings &amp; reports</summary>

      {/* ── Status banner ── */}
      <div className="card first" style={{ borderRadius: "0 0 0 0" }}>
        <div className="section-title">Amazon SP-API Connection</div>
        {statusErr && <div className="upload-status err">{statusErr}</div>}
        {!status && !statusErr && <div className="hint">Checking credentials…</div>}
        {status && (
          <div
            className={"upload-status " + (status.configured ? "ok" : "err")}
            style={{ display: "block" }}
          >
            {status.configured
              ? `✓ Connected. LWA app credentials present · regions: ${(["NA", "EU", "FE"] as const)
                  .filter((r) => status.regions[r])
                  .join(", ") || "none"}${status.sandbox ? " · SANDBOX mode" : ""}`
              : "✗ Not configured yet. Add the Amazon env vars (LWA client id/secret + at least one regional refresh token) in .env.local / Vercel — see .env.example. The UI below is ready and will work the moment credentials are added."}
          </div>
        )}
        <p className="hint" style={{ marginTop: 10 }}>
          Private SP-API app, one brand. The brand must first register as a developer in Seller
          Central, create a draft (private) app, pick the Product Listing / Pricing / Inventory data
          roles, and generate one refresh token per region. See{" "}
          <code>Amazon-API-Integration-Summary.txt</code>.
        </p>
      </div>

      {/* ── Listings editor ── */}
      <div className="card">
        <div className="section-title">Edit Listing — price &amp; quantity</div>
        <div className="row2">
          <div className="field">
            <label>Seller ID</label>
            <input value={sellerId} onChange={(e) => setSellerId(e.target.value)} placeholder="A1B2C3..." />
          </div>
          <div className="field">
            <label>SKU</label>
            <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="QT12-US" />
          </div>
        </div>
        <div className="row2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Marketplace</label>
            <select value={mpCode} onChange={(e) => setMpCode(e.target.value)}>
              {MARKETPLACES.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.code} — {m.name} ({m.region})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>New Price ({MARKETPLACES.find((m) => m.code === mpCode)?.currency})</label>
            <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="leave blank to keep" />
          </div>
        </div>
        <div className="row2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>New Quantity</label>
            <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="leave blank to keep" />
          </div>
          <div className="field" style={{ justifyContent: "flex-end" }}>
            <button className="btn-sm" style={{ padding: "10px 20px" }} onClick={submitListing} disabled={listingBusy}>
              {listingBusy ? "Submitting…" : "Submit Listing Update"}
            </button>
          </div>
        </div>
        {listingMsg && (
          <div className={"upload-status " + listingMsg.kind} style={{ display: "block" }}>
            {listingMsg.msg}
          </div>
        )}
      </div>

      {/* ── Reports ── */}
      <div className="card last">
        <div className="section-title">Pull a Report</div>
        <p className="hint" style={{ marginBottom: 12 }}>
          Bulk historical data → always use Reports (one call = months of data). Workflow: create →
          poll status → download document. Advertising / sponsored-product reports come from the
          separate <strong>Amazon Advertising API</strong> — wire that in once the brand also
          enables Ads API access.
        </p>
        <div className="row2">
          <div className="field">
            <label>Report Type</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value)}>
              {REPORT_TYPES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Marketplace</label>
            <select value={reportMp} onChange={(e) => setReportMp(e.target.value)}>
              {MARKETPLACES.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.code} — {m.name} ({m.region})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="row2" style={{ marginTop: 12 }}>
          <div className="field">
            <label>Data Start</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Data End</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <button className="btn-sm" style={{ padding: "10px 20px" }} onClick={submitReport} disabled={reportBusy}>
            {reportBusy ? "Requesting…" : "Request Report"}
          </button>
        </div>
        {reportMsg && (
          <div className={"upload-status " + reportMsg.kind} style={{ display: "block" }}>
            {reportMsg.msg}
          </div>
        )}
      </div>
      </details>
    </>
  );
}
