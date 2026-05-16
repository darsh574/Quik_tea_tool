"use client";

import { useEffect, useState } from "react";
import { useShipmentStore } from "@/store/useShipmentStore";
import { searchPoRecords } from "@/lib/history";
import { BRAND_CONFIG } from "@/lib/constants";
import type { PoRecord } from "@/lib/types";

/**
 * PO selector — fetches saved PO snapshots from Supabase and lets the user
 * load any of them into the workspace (Routing + Labels + BOL state).
 * Read-only with respect to the math; just calls store.loadRecord().
 */
export default function PoPicker({ context }: { context: "labels" | "bol" }) {
  const loadRecord = useShipmentStore((s) => s.loadRecord);
  const activeBrand = useShipmentStore((s) => s.activeBrand);
  const currentPo = useShipmentStore((s) => s.brandState[s.activeBrand].po);
  const dataVersion = useShipmentStore((s) => s.dataVersion);
  const bumpDataVersion = useShipmentStore((s) => s.bumpDataVersion);

  const [records, setRecords] = useState<PoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    searchPoRecords("")
      .then((rs) => {
        if (!cancelled) setRecords(rs);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load saved POs.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  function applySelection(id: string) {
    const rec = records.find((r) => (r.id || r.po_number) === id);
    if (!rec) return;
    loadRecord(rec);
    setSelected(id);
  }

  const filtered = query
    ? records.filter(
        (r) =>
          r.po_number.toLowerCase().includes(query.toLowerCase()) ||
          (BRAND_CONFIG[r.brand]?.label ?? r.brand).toLowerCase().includes(query.toLowerCase()),
      )
    : records;

  const subtitle =
    context === "labels"
      ? "Pick a saved PO to load its products, DCs and label format into this view."
      : "Pick a saved PO to load its full routing + BOL snapshot.";

  return (
    <div className="qt-popicker">
      <style dangerouslySetInnerHTML={{ __html: `
        .qt-popicker {
          background: #fff;
          border: 1px solid var(--top-border, #e6e0d4);
          border-radius: 12px;
          padding: 14px 18px;
          margin-bottom: 14px;
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 16px;
          align-items: center;
        }
        .qt-popicker-head {
          display: flex;
          gap: 14px;
          align-items: center;
        }
        .qt-popicker-icon {
          width: 36px; height: 36px;
          border-radius: 9px;
          background: #eef3fa;
          color: #0e3a66;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .qt-popicker-titles {
          font-family: inherit;
        }
        .qt-popicker-title {
          font-size: 13px;
          font-weight: 700;
          color: #25303f;
          letter-spacing: 0.1px;
        }
        .qt-popicker-sub {
          font-size: 11.5px;
          color: #7a7a7a;
          margin-top: 2px;
        }
        .qt-popicker-current {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #fdf2dc;
          color: #a47712;
          padding: 3px 9px;
          font-size: 10.5px;
          font-weight: 700;
          border-radius: 999px;
          letter-spacing: 0.3px;
          text-transform: uppercase;
          margin-left: 8px;
        }
        .qt-popicker-controls {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .qt-popicker select, .qt-popicker input {
          padding: 9px 12px;
          background: #f6f3ec;
          border: 1.5px solid #e6e0d4;
          border-radius: 8px;
          font-size: 12.5px;
          color: #25303f;
          font-family: inherit;
          outline: none;
          min-width: 220px;
          transition: border-color 0.15s, background 0.15s;
        }
        .qt-popicker select:focus, .qt-popicker input:focus {
          border-color: #0e3a66;
          background: #fff;
        }
        .qt-popicker-refresh {
          width: 36px;
          height: 36px;
          padding: 0;
          background: #fff;
          border: 1.5px solid #e6e0d4;
          border-radius: 8px;
          color: #0e3a66;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease, border-color 0.15s ease;
          flex-shrink: 0;
        }
        .qt-popicker-refresh:hover {
          background: #0e3a66;
          color: #fff;
          border-color: #0e3a66;
        }
        .qt-popicker-refresh:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .qt-popicker .err {
          color: #c94628;
          font-size: 12px;
          margin-top: 6px;
        }
        .qt-popicker .muted {
          font-size: 12px;
          color: #888;
        }
        @media (max-width: 760px) {
          .qt-popicker { grid-template-columns: 1fr; }
          .qt-popicker-controls { flex-wrap: wrap; }
          .qt-popicker select, .qt-popicker input { min-width: 100%; }
        }
      ` }} />

      <div className="qt-popicker-head">
        <div className="qt-popicker-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="3" y1="10" x2="21" y2="10" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
        </div>
        <div className="qt-popicker-titles">
          <div className="qt-popicker-title">
            Load a saved PO
            {currentPo && (
              <span className="qt-popicker-current">
                Current: {currentPo} · {BRAND_CONFIG[activeBrand]?.label ?? activeBrand}
              </span>
            )}
          </div>
          <div className="qt-popicker-sub">{subtitle}</div>
        </div>
      </div>

      <div className="qt-popicker-controls">
        <input
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 130 }}
        />
        <select
          value={selected}
          onChange={(e) => applySelection(e.target.value)}
          disabled={loading || filtered.length === 0}
        >
          <option value="">
            {loading
              ? "Loading saved POs…"
              : filtered.length === 0
              ? "No saved POs yet"
              : `Select a PO (${filtered.length})`}
          </option>
          {filtered.map((r) => {
            const id = r.id || r.po_number;
            const date = r.updated_at ? new Date(r.updated_at).toLocaleDateString() : "—";
            const brandLabel = BRAND_CONFIG[r.brand]?.label ?? r.brand;
            return (
              <option key={id} value={id}>
                PO {r.po_number} · {brandLabel} · {date}
                {r.bol_number ? ` · BOL ${r.bol_number}` : ""}
              </option>
            );
          })}
        </select>
        <button
          type="button"
          className="qt-popicker-refresh"
          onClick={() => bumpDataVersion()}
          disabled={loading}
          title="Reload saved POs"
          aria-label="Refresh saved POs"
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
              transition: "transform 0.4s ease",
              transform: loading ? "rotate(360deg)" : "rotate(0deg)",
            }}
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      </div>

      {error && <div className="err">{error}</div>}
    </div>
  );
}
