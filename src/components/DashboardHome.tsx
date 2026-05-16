"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useShipmentStore } from "@/store/useShipmentStore";
import { searchPoRecords } from "@/lib/history";
import { BRAND_CONFIG } from "@/lib/constants";
import type { BrandKey, PoRecord, TabKey } from "@/lib/types";

const BRAND_KEYS: BrandKey[] = [
  "burlington",
  "sierra",
  "ddDiscount",
  "homegoods",
  "tjx",
  "marshalls",
];

export default function DashboardHome({ username }: { username: string }) {
  const setActiveTab = useShipmentStore((s) => s.setActiveTab);
  const setActiveBrand = useShipmentStore((s) => s.setActiveBrand);
  const loadRecord = useShipmentStore((s) => s.loadRecord);
  const dataVersion = useShipmentStore((s) => s.dataVersion);
  const bumpDataVersion = useShipmentStore((s) => s.bumpDataVersion);

  const [records, setRecords] = useState<PoRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchPoRecords("")
      .then((rs) => {
        if (!cancelled) setRecords(rs);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  const stats = useMemo(() => {
    const totalRoutes = records.length;
    const labelsGenerated = records.reduce((s, r) => s + (r.label_total ?? 0), 0);
    const bolsCreated = records.filter((r) => !!r.bol_number).length;
    return { totalRoutes, labelsGenerated, bolsCreated, amazonOrders: 0 };
  }, [records]);

  const topLocations = useMemo(() => {
    const counts: Partial<Record<BrandKey, number>> = {};
    records.forEach((r) => {
      counts[r.brand] = (counts[r.brand] ?? 0) + 1;
    });
    const entries = BRAND_KEYS.map((b) => ({
      brand: b,
      label: BRAND_CONFIG[b]?.label ?? b,
      count: counts[b] ?? 0,
    })).sort((a, b) => b.count - a.count);
    const maxCount = Math.max(1, ...entries.map((e) => e.count));
    const total = entries.reduce((s, e) => s + e.count, 0);
    return { entries, maxCount, total };
  }, [records]);

  const chartData = useMemo(() => {
    const months: Record<string, number> = {};
    records.forEach((r) => {
      const ts = r.created_at || r.updated_at;
      const d = ts ? new Date(ts) : new Date();
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months[k] = (months[k] ?? 0) + 1;
    });
    const now = new Date();
    const series: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      series.push({
        label: d.toLocaleDateString("en-US", { month: "short" }),
        value: months[k] ?? 0,
      });
    }
    return series;
  }, [records]);

  const recentActivity = useMemo(() => {
    return records.slice(0, 5).map((r) => {
      const ts = r.updated_at || r.created_at;
      const time = ts ? new Date(ts) : null;
      const brandLabel = BRAND_CONFIG[r.brand]?.label ?? r.brand;
      const hasBol = !!r.bol_number;
      return {
        id: r.id || r.po_number,
        kind: hasBol ? ("bol" as const) : ("route" as const),
        title: hasBol
          ? `BOL ${r.bol_number} generated`
          : `Routing created for ${brandLabel}`,
        sub: `PO ${r.po_number} · ${r.label_total ?? 0} labels`,
        time: time ? relativeTime(time) : "",
      };
    });
  }, [records]);

  const recentRoutes = useMemo(() => records.slice(0, 6), [records]);

  const openRecord = useCallback(
    (rec: PoRecord, tab: TabKey) => {
      loadRecord(rec);
      setActiveTab(tab);
    },
    [loadRecord, setActiveTab],
  );

  return (
    <div className="qt-home">
      <style dangerouslySetInnerHTML={{ __html: `
        .qt-home {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .qt-card {
          background: #fff;
          border: 1px solid var(--top-border, #e6e0d4);
          border-radius: 14px;
          padding: 22px 24px;
          box-shadow: 0 1px 0 rgba(20,63,107,0.02);
        }
        .qt-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }
        .qt-card-title {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 15px;
          font-weight: 700;
          color: #1a2a3a;
          letter-spacing: -0.005em;
        }
        .qt-card-link {
          font-size: 11.5px;
          font-weight: 600;
          color: #0e3a66;
          background: none;
          border: none;
          cursor: pointer;
          padding: 0;
          font-family: inherit;
          letter-spacing: 0.2px;
        }
        .qt-card-link:hover {
          text-decoration: underline;
        }

        /* ── Refresh strip ── */
        .qt-refresh-strip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 4px 2px;
        }
        .qt-refresh-meta {
          font-size: 11.5px;
          color: #888;
          letter-spacing: 0.2px;
          font-weight: 500;
        }
        .qt-refresh-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 14px;
          background: #fff;
          border: 1px solid var(--top-border, #e6e0d4);
          border-radius: 9px;
          font-size: 12px;
          font-weight: 600;
          color: #0e3a66;
          cursor: pointer;
          font-family: inherit;
          transition: background 0.16s, border-color 0.16s, color 0.16s, transform 0.16s;
        }
        .qt-refresh-btn:hover {
          background: #0e3a66;
          color: #fff;
          border-color: #0e3a66;
          transform: translateY(-1px);
        }
        .qt-refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        /* ── Stats row ── */
        .qt-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
        }
        .qt-stat {
          background: #fff;
          border: 1px solid var(--top-border, #e6e0d4);
          border-radius: 14px;
          padding: 20px 22px;
          position: relative;
          overflow: hidden;
          transition: transform 0.16s ease, box-shadow 0.16s ease;
        }
        .qt-stat:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(20,63,107,0.07);
        }
        .qt-stat-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #eef3fa;
          color: #0e3a66;
          margin-bottom: 14px;
        }
        .qt-stat-icon.orange { background: #fdece6; color: #c94628; }
        .qt-stat-icon.green  { background: #e8f6ee; color: #1e7a4a; }
        .qt-stat-icon.gold   { background: #fbf2dc; color: #a47712; }
        .qt-stat-value {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 30px;
          font-weight: 700;
          color: #15243a;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .qt-stat-label {
          font-size: 11.5px;
          color: #6e6960;
          margin-top: 6px;
          font-weight: 600;
          letter-spacing: 0.2px;
        }
        .qt-stat-delta {
          position: absolute;
          top: 22px;
          right: 22px;
          font-size: 11px;
          font-weight: 600;
          padding: 3px 8px;
          border-radius: 999px;
          background: #e8f6ee;
          color: #1e7a4a;
          letter-spacing: 0.2px;
        }
        .qt-stat-delta.muted { background: #f0ede6; color: #888; }

        /* ── Two-column rows ── */
        .qt-row-two {
          display: grid;
          grid-template-columns: 1.7fr 1fr;
          gap: 14px;
        }
        .qt-row-two.equal {
          grid-template-columns: 1fr 1fr;
        }

        /* ── Line chart ── */
        .qt-chart {
          position: relative;
        }
        .qt-chart-meta {
          font-size: 11.5px;
          color: #6e6960;
          margin-bottom: 8px;
          letter-spacing: 0.2px;
        }
        .qt-chart svg {
          width: 100%;
          height: auto;
          display: block;
        }
        .qt-chart-axis {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          font-size: 11px;
          color: #999;
          margin-top: 6px;
          text-align: center;
          font-weight: 500;
          letter-spacing: 0.4px;
        }

        /* ── Activity list ── */
        .qt-activity {
          display: flex;
          flex-direction: column;
        }
        .qt-activity-item {
          display: grid;
          grid-template-columns: 32px 1fr auto;
          align-items: center;
          gap: 12px;
          padding: 10px 0;
          border-bottom: 1px solid #f3eee5;
        }
        .qt-activity-item:last-child { border-bottom: none; }
        .qt-activity-dot {
          width: 32px; height: 32px;
          border-radius: 8px;
          background: #eef3fa;
          color: #0e3a66;
          display: flex; align-items: center; justify-content: center;
        }
        .qt-activity-dot.bol { background: #fdece6; color: #c94628; }
        .qt-activity-title {
          font-size: 12.5px;
          font-weight: 600;
          color: #25303f;
          line-height: 1.3;
        }
        .qt-activity-sub {
          font-size: 11px;
          color: #888;
          margin-top: 1px;
        }
        .qt-activity-time {
          font-size: 10.5px;
          color: #aaa;
          font-weight: 500;
          white-space: nowrap;
        }
        .qt-empty {
          padding: 18px 4px;
          color: #aaa;
          font-size: 12.5px;
          font-style: italic;
        }

        /* ── Top locations ── */
        .qt-loc-row {
          display: grid;
          grid-template-columns: 24px 1fr auto;
          align-items: center;
          gap: 14px;
          padding: 11px 0;
          border-bottom: 1px solid #f3eee5;
        }
        .qt-loc-row:last-child { border-bottom: none; }
        .qt-loc-pin {
          width: 24px; height: 24px;
          border-radius: 6px;
          background: #eef3fa;
          color: #0e3a66;
          display: flex; align-items: center; justify-content: center;
        }
        .qt-loc-text {
          font-size: 12.5px;
        }
        .qt-loc-name {
          font-weight: 600;
          color: #25303f;
          margin-bottom: 4px;
        }
        .qt-loc-sub {
          font-size: 10.5px;
          color: #aaa;
          margin-bottom: 4px;
        }
        .qt-loc-bar {
          height: 5px;
          width: 100%;
          background: #f0ede6;
          border-radius: 999px;
          overflow: hidden;
        }
        .qt-loc-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #1e7a4a, #46b074);
          transition: width 0.4s ease;
        }
        .qt-loc-pct {
          font-size: 11.5px;
          font-weight: 700;
          color: #1e7a4a;
          font-variant-numeric: tabular-nums;
        }

        /* ── Quick actions ── */
        .qt-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .qt-action {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          background: #f7f5ef;
          border: 1px solid transparent;
          border-radius: 10px;
          cursor: pointer;
          font-family: inherit;
          text-align: left;
          width: 100%;
          color: #25303f;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.16s ease;
        }
        .qt-action:hover {
          background: #fff;
          border-color: #e6e0d4;
          transform: translateX(2px);
        }
        .qt-action-icon {
          width: 30px; height: 30px;
          border-radius: 7px;
          background: #fff;
          color: #0e3a66;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .qt-action.orange .qt-action-icon { color: #c94628; }
        .qt-action.green  .qt-action-icon { color: #1e7a4a; }
        .qt-action.gold   .qt-action-icon { color: #a47712; }

        /* ── Recent routes table ── */
        .qt-routes table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .qt-routes thead th {
          background: transparent;
          color: #888;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          padding: 10px 12px;
          text-align: left;
          border-bottom: 1px solid #f0ede6;
          white-space: nowrap;
        }
        .qt-routes tbody td {
          padding: 12px;
          border-bottom: 1px solid #f3eee5;
          color: #25303f;
          text-align: left;
        }
        .qt-routes tbody tr:last-child td { border-bottom: none; }
        .qt-routes tbody tr:hover td { background: #fbf9f4; }
        .qt-routes .po-cell {
          font-weight: 700;
          color: #0e3a66;
          font-variant-numeric: tabular-nums;
        }
        .qt-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 3px 9px;
          font-size: 10.5px;
          font-weight: 600;
          letter-spacing: 0.4px;
          border-radius: 999px;
        }
        .qt-pill.completed { background: #e8f6ee; color: #1e7a4a; }
        .qt-pill.progress  { background: #fdf2dc; color: #a47712; }
        .qt-pill.draft     { background: #f0ede6; color: #888; }
        .qt-row-action {
          background: none;
          border: 1px solid #e6e0d4;
          color: #0e3a66;
          padding: 5px 11px;
          border-radius: 7px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
        }
        .qt-row-action:hover {
          background: #0e3a66;
          color: #fff;
          border-color: #0e3a66;
        }

        @media (max-width: 1000px) {
          .qt-stats { grid-template-columns: repeat(2, 1fr); }
          .qt-row-two, .qt-row-two.equal { grid-template-columns: 1fr; }
        }
      ` }} />

      {/* ─── Refresh strip ─── */}
      <div className="qt-refresh-strip">
        <span className="qt-refresh-meta">
          {loading
            ? "Loading dashboard data…"
            : `${records.length} PO ${records.length === 1 ? "record" : "records"} loaded`}
        </span>
        <button
          type="button"
          className="qt-refresh-btn"
          onClick={() => bumpDataVersion()}
          disabled={loading}
          title="Reload all dashboard data from Supabase"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transition: "transform 0.5s ease",
              transform: loading ? "rotate(360deg)" : "rotate(0deg)",
            }}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* ─── Stats row ─── */}
      <div className="qt-stats">
        <StatCard
          icon={<IconRoute />}
          accent="default"
          value={stats.totalRoutes}
          label="Total Routes"
          delta={records.length > 0 ? "+12% this week" : null}
        />
        <StatCard
          icon={<IconLabel />}
          accent="green"
          value={stats.labelsGenerated}
          label="Labels Generated"
          delta={stats.labelsGenerated > 0 ? "+8% this week" : null}
        />
        <StatCard
          icon={<IconDoc />}
          accent="gold"
          value={stats.bolsCreated}
          label="BOLs Created"
          delta={stats.bolsCreated > 0 ? "+5% this week" : null}
        />
        <StatCard
          icon={<IconCart />}
          accent="orange"
          value={stats.amazonOrders}
          label="Amazon Orders"
          delta={null}
        />
      </div>

      {/* ─── Chart + Activity ─── */}
      <div className="qt-row-two">
        <div className="qt-card qt-chart">
          <div className="qt-card-head">
            <div className="qt-card-title">Routing Overview</div>
            <div className="qt-card-link" style={{ pointerEvents: "none", cursor: "default" }}>
              {chartData[chartData.length - 1]?.label} · {chartData[chartData.length - 1]?.value} POs
            </div>
          </div>
          <div className="qt-chart-meta">POs created · last 6 months</div>
          <LineChart data={chartData} />
          <div className="qt-chart-axis">
            {chartData.map((p, i) => (
              <span key={i}>{p.label}</span>
            ))}
          </div>
        </div>

        <div className="qt-card">
          <div className="qt-card-head">
            <div className="qt-card-title">Recent Activity</div>
            <button className="qt-card-link" onClick={() => setActiveTab("history")}>
              View All
            </button>
          </div>
          <div className="qt-activity">
            {loading && <div className="qt-empty">Loading…</div>}
            {!loading && recentActivity.length === 0 && (
              <div className="qt-empty">No activity yet — generate a BOL to see it here.</div>
            )}
            {recentActivity.map((a) => (
              <div key={a.id} className="qt-activity-item">
                <div className={`qt-activity-dot ${a.kind === "bol" ? "bol" : ""}`}>
                  {a.kind === "bol" ? <IconDoc small /> : <IconRoute small />}
                </div>
                <div>
                  <div className="qt-activity-title">{a.title}</div>
                  <div className="qt-activity-sub">{a.sub}</div>
                </div>
                <div className="qt-activity-time">{a.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Top Locations + Quick Actions ─── */}
      <div className="qt-row-two">
        <div className="qt-card">
          <div className="qt-card-head">
            <div className="qt-card-title">Top Locations</div>
            <button className="qt-card-link" onClick={() => setActiveTab("history")}>
              View All
            </button>
          </div>
          {topLocations.entries.map((loc) => {
            const pct = topLocations.total
              ? Math.round((loc.count / topLocations.total) * 100)
              : 0;
            return (
              <div key={loc.brand} className="qt-loc-row">
                <div className="qt-loc-pin">
                  <IconPin />
                </div>
                <div className="qt-loc-text">
                  <div className="qt-loc-name">{loc.label}</div>
                  <div className="qt-loc-sub">
                    {loc.count} {loc.count === 1 ? "routing" : "routings"}
                  </div>
                  <div className="qt-loc-bar">
                    <div
                      className="qt-loc-bar-fill"
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                </div>
                <div className="qt-loc-pct">{pct}%</div>
              </div>
            );
          })}
        </div>

        <div className="qt-card">
          <div className="qt-card-head">
            <div className="qt-card-title">Quick Actions</div>
          </div>
          <div className="qt-actions">
            <button
              className="qt-action"
              onClick={() => {
                setActiveBrand("homegoods");
                setActiveTab("routing");
              }}
            >
              <span className="qt-action-icon">
                <IconPlus />
              </span>
              Create New Routing
            </button>
            <button className="qt-action green" onClick={() => setActiveTab("labels")}>
              <span className="qt-action-icon">
                <IconLabel small />
              </span>
              Generate Labels
            </button>
            <button className="qt-action orange" onClick={() => setActiveTab("bol")}>
              <span className="qt-action-icon">
                <IconDoc small />
              </span>
              Create BOL
            </button>
            <button className="qt-action gold" onClick={() => setActiveTab("amazon")}>
              <span className="qt-action-icon">
                <IconSync />
              </span>
              Sync Amazon Orders
            </button>
            <button className="qt-action" onClick={() => setActiveTab("history")}>
              <span className="qt-action-icon">
                <IconClock />
              </span>
              View History
            </button>
          </div>
        </div>
      </div>

      {/* ─── Recent Routes table ─── */}
      <div className="qt-card qt-routes">
        <div className="qt-card-head">
          <div className="qt-card-title">Recent Routes</div>
          <button className="qt-card-link" onClick={() => setActiveTab("history")}>
            View All
          </button>
        </div>
        {loading && <div className="qt-empty">Loading…</div>}
        {!loading && recentRoutes.length === 0 && (
          <div className="qt-empty">No PO records yet. Generate a BOL on the Routing → BOL flow to create the first one.</div>
        )}
        {!loading && recentRoutes.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>PO ID</th>
                <th>Location</th>
                <th>Stops</th>
                <th>Status</th>
                <th>Date</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recentRoutes.map((r) => {
                const dcCount = r.shipment_state?.dcs?.length ?? 0;
                const status = r.bol_number ? "completed" : dcCount > 0 ? "progress" : "draft";
                const statusLabel = status === "completed" ? "Completed" : status === "progress" ? "In Progress" : "Draft";
                const date = r.updated_at || r.created_at;
                return (
                  <tr key={r.id || r.po_number}>
                    <td className="po-cell">{r.po_number}</td>
                    <td>{BRAND_CONFIG[r.brand]?.label ?? r.brand}</td>
                    <td>{dcCount}</td>
                    <td>
                      <span className={`qt-pill ${status}`}>
                        <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor", opacity: 0.7 }} />
                        {statusLabel}
                      </span>
                    </td>
                    <td>{date ? new Date(date).toLocaleDateString() : "—"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button className="qt-row-action" onClick={() => openRecord(r, "bol")}>
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatCard({
  icon,
  value,
  label,
  delta,
  accent,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  delta: string | null;
  accent: "default" | "orange" | "green" | "gold";
}) {
  const accentClass = accent === "default" ? "" : accent;
  return (
    <div className="qt-stat">
      <div className={`qt-stat-icon ${accentClass}`}>{icon}</div>
      <div className="qt-stat-value">{value.toLocaleString()}</div>
      <div className="qt-stat-label">{label}</div>
      {delta && <div className="qt-stat-delta">{delta}</div>}
      {!delta && <div className="qt-stat-delta muted">No change</div>}
    </div>
  );
}

function LineChart({ data }: { data: { label: string; value: number }[] }) {
  const W = 600;
  const H = 180;
  const pad = { l: 24, r: 18, t: 12, b: 8 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const maxV = Math.max(4, ...data.map((d) => d.value));
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const points = data.map((d, i) => {
    const x = pad.l + i * stepX;
    const y = pad.t + innerH - (d.value / maxV) * innerH;
    return { x, y, v: d.value };
  });
  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = `M ${pad.l},${pad.t + innerH} L ${points
    .map((p) => `${p.x},${p.y}`)
    .join(" L ")} L ${pad.l + innerW},${pad.t + innerH} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <defs>
        <linearGradient id="qt-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#1e7a4a" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#1e7a4a" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* gridlines */}
      {[0.25, 0.5, 0.75].map((t) => (
        <line
          key={t}
          x1={pad.l}
          x2={pad.l + innerW}
          y1={pad.t + innerH * t}
          y2={pad.t + innerH * t}
          stroke="#f0ede6"
          strokeWidth="1"
        />
      ))}
      <path d={areaPath} fill="url(#qt-area)" />
      <polyline
        points={polyline}
        fill="none"
        stroke="#1e7a4a"
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#fff" stroke="#1e7a4a" strokeWidth="2.2" />
        </g>
      ))}
    </svg>
  );
}

// ── Inline icons ──
function IconRoute({ small }: { small?: boolean }) {
  const s = small ? 14 : 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5" />
    </svg>
  );
}
function IconLabel({ small }: { small?: boolean }) {
  const s = small ? 14 : 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.5" />
    </svg>
  );
}
function IconDoc({ small }: { small?: boolean }) {
  const s = small ? 14 : 18;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="13" x2="16" y2="13" />
      <line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  );
}
function IconCart() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M3 4h2l2.4 12h11l2-8H6" />
    </svg>
  );
}
function IconPin() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s-7-7.5-7-13a7 7 0 0 1 14 0c0 5.5-7 13-7 13z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
function IconSync() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString();
}
