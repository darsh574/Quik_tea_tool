"use client";

import { useEffect, useState, useCallback } from "react";
import { searchPoRecords, deletePoRecord } from "@/lib/history";
import { useShipmentStore } from "@/store/useShipmentStore";
import { useCurrentUser } from "@/components/UserContext";
import { BRAND_CONFIG } from "@/lib/constants";
import { generateLabelZip, downloadBlob } from "@/lib/labelPdf";
import { buildBolPDF } from "@/lib/bolPdf";
import type { PoRecord, TabKey } from "@/lib/types";

export default function HistoryTab() {
  const loadRecord = useShipmentStore((s) => s.loadRecord);
  const setActiveTab = useShipmentStore((s) => s.setActiveTab);
  const dataVersion = useShipmentStore((s) => s.dataVersion);
  const bumpDataVersion = useShipmentStore((s) => s.bumpDataVersion);
  const currentUser = useCurrentUser();
  const canDelete = currentUser.role === "admin";

  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<PoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const runSearch = useCallback(async (q: string) => {
    setLoading(true);
    setError("");
    try {
      setRecords(await searchPoRecords(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-run search on mount, and any time a save/delete elsewhere bumps the version.
  useEffect(() => {
    runSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runSearch, dataVersion]);

  async function handleDelete(rec: PoRecord) {
    const id = rec.id;
    if (!id) return;
    const ok = window.confirm(
      `Delete PO ${rec.po_number} (${BRAND_CONFIG[rec.brand]?.label ?? rec.brand})?\n\nThis removes the routing + label + BOL snapshot permanently. It cannot be undone.`,
    );
    if (!ok) return;
    setDeletingId(id);
    setError("");
    try {
      await deletePoRecord(id);
      bumpDataVersion();
      if (openId === id) setOpenId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  function loadIntoWorkspace(rec: PoRecord, goTo: TabKey) {
    loadRecord(rec);
    setActiveTab(goTo);
  }

  async function downloadLabels(rec: PoRecord) {
    setBusy(rec.id || rec.po_number);
    try {
      const { blob, filename } = await generateLabelZip(rec.brand, rec.shipment_state, rec.label_format);
      downloadBlob(blob, filename);
    } finally {
      setBusy("");
    }
  }

  function downloadBol(rec: PoRecord) {
    const doc = buildBolPDF(rec.bol_form, true);
    doc.save("TJX_BOL_" + (rec.bol_form.bol_number || rec.po_number) + ".pdf");
  }

  return (
    <div className="card first last">
      <div className="section-title">PO History — search saved shipments</div>
      <p className="hint" style={{ marginBottom: 14 }}>
        Every generated BOL saves the full Routing + Labels + BOL snapshot here, keyed by PO. Enter
        a PO number (or just its trailing digits) to recall a shipment — even months later.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
        style={{ display: "flex", gap: 8, marginBottom: 18 }}
      >
        <input
          className="bol-search"
          placeholder="Enter PO number, e.g. 631004"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            padding: "10px 13px",
            border: "1.5px solid var(--border)",
            borderRadius: 8,
            fontSize: 13,
            background: "var(--cream)",
            outline: "none",
          }}
        />
        <button className="btn-sm" type="submit" style={{ padding: "10px 20px" }}>
          Search
        </button>
        <button
          type="button"
          className="bol-preview-btn"
          onClick={() => bumpDataVersion()}
          disabled={loading}
          title="Reload the PO list from Supabase"
        >
          ↻ Refresh
        </button>
        {query && (
          <button
            type="button"
            className="bol-preview-btn"
            onClick={() => {
              setQuery("");
              runSearch("");
            }}
          >
            Clear
          </button>
        )}
      </form>

      {error && <div className="upload-status err">{error}</div>}
      {loading && <div className="empty-state">Loading…</div>}

      {!loading && records.length === 0 && (
        <div className="empty-state">
          No saved POs{query ? ` matching “${query}”` : " yet"}. Generate a BOL to create the first
          record.
        </div>
      )}

      {!loading && records.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Brand</th>
                <th>Generated By</th>
                <th>Generated On</th>
                <th>Labels</th>
                <th>Pallets</th>
                <th>BOL #</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec) => {
                const id = rec.id || rec.po_number;
                const open = openId === id;
                return (
                  <RecordRow
                    key={id}
                    rec={rec}
                    open={open}
                    busy={busy === id}
                    deleting={deletingId === id}
                    canDelete={canDelete}
                    onToggle={() => setOpenId(open ? null : id)}
                    onDownloadLabels={() => downloadLabels(rec)}
                    onDownloadBol={() => downloadBol(rec)}
                    onEditBol={() => loadIntoWorkspace(rec, "bol")}
                    onOpenRouting={() => loadIntoWorkspace(rec, "routing")}
                    onDelete={() => handleDelete(rec)}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecordRow({
  rec,
  open,
  busy,
  deleting,
  canDelete,
  onToggle,
  onDownloadLabels,
  onDownloadBol,
  onEditBol,
  onOpenRouting,
  onDelete,
}: {
  rec: PoRecord;
  open: boolean;
  busy: boolean;
  deleting: boolean;
  canDelete: boolean;
  onToggle: () => void;
  onDownloadLabels: () => void;
  onDownloadBol: () => void;
  onEditBol: () => void;
  onOpenRouting: () => void;
  onDelete: () => void;
}) {
  const updated = rec.updated_at ? new Date(rec.updated_at).toLocaleString() : "—";
  const generatedOn = rec.created_at
    ? new Date(rec.created_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
  const generatedBy = rec.created_by_username || "—";
  const tot = rec.summary?.tot;

  return (
    <>
      <tr style={{ cursor: "pointer" }} onClick={onToggle}>
        <td style={{ fontWeight: 700, color: "var(--navy)" }}>{rec.po_number}</td>
        <td>{BRAND_CONFIG[rec.brand]?.label ?? rec.brand}</td>
        <td style={{ fontSize: 12 }}>{generatedBy}</td>
        <td style={{ fontSize: 12 }}>{generatedOn}</td>
        <td>{rec.label_total}</td>
        <td>{rec.total_pallets}</td>
        <td>{rec.bol_number || "—"}</td>
        <td style={{ fontSize: 11 }}>{updated}</td>
        <td style={{ color: "var(--navy)", fontWeight: 700 }}>{open ? "▲" : "▼"}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={9} style={{ background: "var(--cream)", textAlign: "left", padding: 16 }}>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 14, fontSize: 12 }}>
              <span>
                <strong>Products:</strong> {rec.shipment_state.products.join(", ") || "—"}
              </span>
              <span>
                <strong>DCs:</strong>{" "}
                {rec.shipment_state.dcs.map((d) => `${d.num} ${d.code}`).join(", ") || "—"}
              </span>
              {tot && (
                <>
                  <span>
                    <strong>Total Cases:</strong> {Math.round(tot.totalCases)}
                  </span>
                  <span>
                    <strong>Gross Wt:</strong> {Math.ceil(tot.grossWt).toLocaleString()} lb
                  </span>
                  <span>
                    <strong>Value:</strong> ${Math.ceil(tot.value).toLocaleString()}
                  </span>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn-sm" onClick={onDownloadLabels} disabled={busy}>
                {busy ? "Building…" : "⬇ Re-download Labels ZIP"}
              </button>
              <button className="btn-sm" onClick={onDownloadBol}>
                ⬇ Download BOL PDF
              </button>
              <button className="btn-sm" onClick={onEditBol}>
                ✎ Edit BOL
              </button>
              <button className="btn-sm" onClick={onOpenRouting}>
                ↗ Open full shipment (Routing)
              </button>
              {canDelete && (
                <button
                  className="btn-sm"
                  onClick={onDelete}
                  disabled={deleting || !rec.id}
                  style={{
                    background: "#c94628",
                    marginLeft: "auto",
                  }}
                  title={rec.id ? "Permanently delete this PO record" : "Cannot delete a record without an id"}
                >
                  {deleting ? "Deleting…" : "🗑 Delete PO"}
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
