"use client";

import { useEffect, useState } from "react";
import { MARKETPLACES } from "@/lib/amazon/regions";

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

export default function AmazonTab() {
  const [status, setStatus] = useState<ConfigStatus | null>(null);
  const [statusErr, setStatusErr] = useState("");

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
      {/* ── Status banner ── */}
      <div className="card first">
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
    </>
  );
}
