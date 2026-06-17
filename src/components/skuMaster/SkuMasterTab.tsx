"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCurrentUser } from "@/components/UserContext";
import {
  listSkuMaster,
  upsertSkuMaster,
  deleteSkuMaster,
  bulkUpsertSkuMaster,
  blankSkuMasterInput,
  type SkuMasterInput,
} from "@/lib/skuMaster";
import {
  downloadSkuMasterTemplate,
  parseSkuMasterFile,
  SKU_COLUMNS,
  type ParsedSkuRow,
} from "@/lib/skuExcel";
import type { SkuMasterRow } from "@/lib/types";

interface DraftRow extends SkuMasterInput {
  _localId: string;
}

const newDraft = (): DraftRow => ({
  ...blankSkuMasterInput(),
  _localId: Math.random().toString(36).slice(2),
});

// Section background tints for visual grouping in the header
const SECTION_BG: Record<"item" | "unit" | "case" | "pallet", string> = {
  item: "#f6f3ec",
  unit: "#eef3fa",
  case: "#fdf2dc",
  pallet: "#e8f6ee",
};

const SECTION_LABEL: Record<"item" | "unit" | "case" | "pallet", string> = {
  item: "Item",
  unit: "Unit",
  case: "Case",
  pallet: "Pallet",
};

// Build the spanned section row (column index → label or null when continuing)
function buildSectionRow() {
  const spans: { section: keyof typeof SECTION_LABEL; start: number; end: number }[] = [];
  let curStart = 0;
  let curSection = SKU_COLUMNS[0].section;
  for (let i = 1; i <= SKU_COLUMNS.length; i++) {
    if (i === SKU_COLUMNS.length || SKU_COLUMNS[i].section !== curSection) {
      spans.push({ section: curSection, start: curStart, end: i - 1 });
      if (i < SKU_COLUMNS.length) {
        curStart = i;
        curSection = SKU_COLUMNS[i].section;
      }
    }
  }
  return spans;
}
const SECTION_SPANS = buildSectionRow();

export default function SkuMasterTab() {
  const me = useCurrentUser();
  const isAdmin = me.role === "admin";
  const canDelete = isAdmin;

  const [rows, setRows] = useState<SkuMasterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Per-row inline edit state: id → draft
  const [editing, setEditing] = useState<Record<string, SkuMasterInput>>({});
  // Unsaved new rows
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Bulk import preview
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewing, setPreviewing] = useState<ParsedSkuRow[] | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await listSkuMaster());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load SKUs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    window.setTimeout(() => setMsg(null), 4000);
  }

  function startEdit(row: SkuMasterRow) {
    if (!row.id) return;
    const draft = blankSkuMasterInput();
    SKU_COLUMNS.forEach((col) => {
      (draft as Record<string, unknown>)[col.key] = (row as unknown as Record<string, unknown>)[
        col.key
      ] as unknown;
    });
    setEditing((s) => ({ ...s, [row.id!]: draft }));
  }

  function cancelEdit(id: string) {
    setEditing((s) => {
      const next = { ...s };
      delete next[id];
      return next;
    });
  }

  function patchEdit(id: string, key: keyof SkuMasterInput, value: unknown) {
    setEditing((s) => ({
      ...s,
      [id]: { ...s[id], [key]: value as never },
    }));
  }

  async function saveEdit(id: string) {
    const draft = editing[id];
    if (!draft) return;
    if (!draft.item_code?.trim()) {
      flash("err", "Item Code is required.");
      return;
    }
    setBusyId(id);
    try {
      await upsertSkuMaster(draft);
      flash("ok", `✓ Saved ${draft.item_code.toUpperCase()}.`);
      cancelEdit(id);
      await load();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Save failed.");
    } finally {
      setBusyId(null);
    }
  }

  function addBlankDraft() {
    setDrafts((d) => [newDraft(), ...d]);
  }

  function patchDraft(localId: string, key: keyof SkuMasterInput, value: unknown) {
    setDrafts((d) =>
      d.map((r) =>
        r._localId === localId
          ? ({ ...r, [key]: value } as DraftRow)
          : r,
      ),
    );
  }

  async function saveDraft(localId: string) {
    const draft = drafts.find((d) => d._localId === localId);
    if (!draft) return;
    if (!draft.item_code?.trim()) {
      flash("err", "Item Code is required.");
      return;
    }
    setBusyId(localId);
    try {
      const payload: SkuMasterInput = blankSkuMasterInput();
      const draftRec = draft as unknown as Record<string, unknown>;
      (Object.keys(payload) as (keyof SkuMasterInput)[]).forEach((k) => {
        (payload as Record<string, unknown>)[k] = draftRec[k];
      });
      await upsertSkuMaster(payload);
      flash("ok", `✓ Added ${draft.item_code.toUpperCase()}.`);
      setDrafts((d) => d.filter((r) => r._localId !== localId));
      await load();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Add failed.");
    } finally {
      setBusyId(null);
    }
  }

  function discardDraft(localId: string) {
    setDrafts((d) => d.filter((r) => r._localId !== localId));
  }

  async function handleDelete(row: SkuMasterRow) {
    if (!row.id) return;
    if (!window.confirm(`Delete SKU "${row.item_code}"? This cannot be undone.`)) return;
    setBusyId(row.id);
    try {
      await deleteSkuMaster(row.id);
      flash("ok", `✓ Deleted ${row.item_code}.`);
      await load();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setPreviewing(null);
    setError("");
    try {
      const parsed = await parseSkuMasterFile(file);
      if (parsed.length === 0) {
        flash("err", "No rows found in the sheet.");
        return;
      }
      setPreviewing(parsed);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Could not read the file.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function confirmImport() {
    if (!previewing) return;
    const valid = previewing.filter((p) => p.ok && p.data).map((p) => p.data!) as SkuMasterInput[];
    if (valid.length === 0) {
      flash("err", "No valid rows to import.");
      return;
    }
    setImporting(true);
    try {
      const res = await bulkUpsertSkuMaster(valid);
      let text = `✓ Imported ${res.saved} SKU${res.saved === 1 ? "" : "s"}.`;
      if (res.dedupedDuplicates > 0) {
        const codes = res.duplicateCodes.slice(0, 5).join(", ");
        const more = res.duplicateCodes.length > 5 ? ` …+${res.duplicateCodes.length - 5} more` : "";
        text += ` (${res.dedupedDuplicates} duplicate row${
          res.dedupedDuplicates === 1 ? "" : "s"
        } collapsed; kept last for: ${codes}${more})`;
      }
      flash("ok", text);
      setPreviewing(null);
      await load();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  // ── Render helpers ──
  function renderCell(
    row: SkuMasterRow | DraftRow | null,
    draft: SkuMasterInput | null,
    col: (typeof SKU_COLUMNS)[number],
    onChange: ((value: unknown) => void) | null,
  ) {
    const editable = !!onChange;
    if (editable) {
      const v = (draft as Record<string, unknown>)[col.key];
      if (col.type === "text") {
        return (
          <input
            value={v == null ? "" : String(v)}
            onChange={(e) =>
              onChange!(
                col.key === "item_code" ? e.target.value.toUpperCase() : e.target.value,
              )
            }
            placeholder={col.key === "item_code" ? "QT15" : ""}
            autoFocus={col.key === "item_code" && (draft as DraftRow)?._localId !== undefined}
          />
        );
      }
      // number / int
      return (
        <input
          type="number"
          step={col.type === "int" ? 1 : "any"}
          value={v == null ? "" : Number(v)}
          onChange={(e) => {
            if (e.target.value === "") return onChange!(null);
            const n =
              col.type === "int" ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
            onChange!(Number.isFinite(n) ? n : null);
          }}
        />
      );
    }

    // Read-only
    if (!row) return null;
    const value = (row as unknown as Record<string, unknown>)[col.key];
    if (value === null || value === undefined || value === "") {
      return <span style={{ color: "#cdc8be" }}>—</span>;
    }
    if (col.type === "text") return String(value);
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value);
    // Format numbers: integers stay clean, decimals show up to 4 places (trim trailing zeros)
    if (col.type === "int") return num.toString();
    return num.toFixed(4).replace(/\.?0+$/, "");
  }

  return (
    <div className="qt-sku">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .qt-sku { display: flex; flex-direction: column; gap: 14px; }
            .qt-sku-card {
              background: #fff;
              border: 1px solid #e6e0d4;
              border-radius: 14px;
              padding: 22px 24px;
            }
            .qt-sku-toolbar {
              display: flex; align-items: center; justify-content: space-between;
              gap: 12px; flex-wrap: wrap;
            }
            .qt-sku-toolbar-left { display: flex; flex-direction: column; gap: 3px; }
            .qt-sku-title {
              font-family: Georgia, serif; font-size: 16px; font-weight: 700; color: #1a2a3a;
            }
            .qt-sku-sub { font-size: 12px; color: #6e6960; line-height: 1.5; }
            .qt-sku-actions { display: flex; gap: 8px; flex-wrap: wrap; }
            .qt-sku-btn {
              padding: 9px 14px; background: #0e3a66; color: #fff; border: none;
              border-radius: 8px; font-size: 12px; font-weight: 600; letter-spacing: 0.3px;
              cursor: pointer; font-family: inherit;
              transition: background 0.15s, transform 0.15s;
              display: inline-flex; align-items: center; gap: 7px;
            }
            .qt-sku-btn:hover { background: #082a4f; transform: translateY(-1px); }
            .qt-sku-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
            .qt-sku-btn.ghost {
              background: transparent; color: #0e3a66; border: 1px solid #e6e0d4;
            }
            .qt-sku-btn.ghost:hover { background: #f0ede6; }
            .qt-sku-btn.accent { background: #e8593c; }
            .qt-sku-btn.accent:hover { background: #c94628; }
            .qt-sku-btn.danger { background: #c94628; }

            .qt-sku-msg { padding: 10px 14px; border-radius: 8px; font-size: 12.5px; }
            .qt-sku-msg.ok  { background: #e8f6ee; color: #1e7a4a; }
            .qt-sku-msg.err { background: #fdece6; color: #c94628; }

            .qt-sku-tablewrap {
              overflow: auto;
              max-height: 70vh;
              border: 1px solid #e6e0d4;
              border-radius: 10px;
            }
            .qt-sku-table {
              border-collapse: separate;
              border-spacing: 0;
              font-size: 12px;
              font-variant-numeric: tabular-nums;
              min-width: 100%;
            }
            .qt-sku-table thead th {
              padding: 7px 9px;
              text-align: left;
              border-bottom: 1.5px solid #d6ccb8;
              border-right: 1px solid #ede6d6;
              white-space: nowrap;
              position: sticky;
              top: 0;
              z-index: 2;
              font-weight: 700;
              color: #5a6370;
              font-size: 10.5px;
              letter-spacing: 0.04em;
            }
            .qt-sku-table thead tr.sections th {
              top: 0;
              border-bottom: 1px solid #d6ccb8;
              text-transform: uppercase;
              font-size: 10px;
              letter-spacing: 0.16em;
              text-align: center;
              padding: 6px 8px;
            }
            .qt-sku-table thead tr.cols th {
              top: 26px;
              background: #fff;
            }
            .qt-sku-table tbody td {
              padding: 6px 9px;
              border-bottom: 1px solid #f3eee5;
              border-right: 1px solid #f3eee5;
              color: #25303f;
              vertical-align: middle;
              white-space: nowrap;
            }
            .qt-sku-table tbody td.num { text-align: right; }
            .qt-sku-table tbody tr:last-child td { border-bottom: none; }
            .qt-sku-table tbody tr.editing td,
            .qt-sku-table tbody tr.draft td {
              background: #fbf9f4;
            }
            .qt-sku-table tbody tr.draft td:first-child {
              border-left: 3px solid #e8593c;
            }
            .qt-sku-table tbody tr:not(.editing):not(.draft):hover td {
              background: #fbf9f4;
            }
            .qt-sku-table .code-cell {
              font-weight: 700; color: #0e3a66;
            }
            .qt-sku-table input {
              width: 100%;
              padding: 5px 8px;
              border: 1.5px solid #d6ccb8;
              border-radius: 5px;
              background: #fff;
              font-size: 12px;
              color: #25303f;
              font-family: inherit;
              outline: none;
              transition: border-color 0.12s, box-shadow 0.12s;
              font-variant-numeric: tabular-nums;
            }
            .qt-sku-table input:focus {
              border-color: #0e3a66;
              box-shadow: 0 0 0 2px rgba(14,58,102,0.1);
            }
            .qt-sku-table input[type="number"] { text-align: right; }
            .qt-sku-table td.actions-cell {
              position: sticky; right: 0; background: #fff; border-left: 1px solid #ede6d6;
              z-index: 1;
            }
            .qt-sku-table tbody tr.editing td.actions-cell,
            .qt-sku-table tbody tr.draft td.actions-cell { background: #fbf9f4; }
            .qt-sku-table tbody tr:not(.editing):not(.draft):hover td.actions-cell { background: #fbf9f4; }
            .qt-sku-table thead th.actions-cell {
              position: sticky; right: 0; background: #f6f3ec; z-index: 3;
              border-left: 1px solid #d6ccb8;
            }
            .qt-sku-table .row-actions {
              display: flex; gap: 5px; justify-content: flex-end; flex-wrap: wrap;
            }
            .qt-sku-table .row-actions .qt-sku-btn {
              padding: 4px 10px; font-size: 10.5px;
            }
            .qt-sku-empty {
              padding: 36px 18px; text-align: center; color: #aaa;
              font-style: italic; font-size: 13px;
            }

            /* Preview modal */
            .qt-sku-preview-overlay {
              position: fixed; inset: 0; background: rgba(14, 26, 38, 0.45);
              z-index: 1000; display: flex; align-items: center; justify-content: center;
              padding: 24px;
            }
            .qt-sku-preview {
              background: #fff; border-radius: 14px;
              width: min(1080px, 100%); max-height: 88vh;
              display: flex; flex-direction: column; overflow: hidden;
            }
            .qt-sku-preview-head {
              padding: 18px 22px; border-bottom: 1px solid #e6e0d4;
              display: flex; justify-content: space-between; align-items: center;
            }
            .qt-sku-preview-head h3 {
              font-family: Georgia, serif; font-size: 16px;
              font-weight: 700; color: #1a2a3a; margin: 0;
            }
            .qt-sku-preview-body { flex: 1; overflow: auto; padding: 4px 22px 12px; }
            .qt-sku-preview-foot {
              padding: 14px 22px; border-top: 1px solid #e6e0d4;
              display: flex; gap: 10px; justify-content: flex-end; background: #fbf9f4;
            }
            .qt-sku-preview-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
            .qt-sku-preview-table th, .qt-sku-preview-table td {
              padding: 6px 9px; border-bottom: 1px solid #f3eee5; text-align: left;
              white-space: nowrap;
            }
            .qt-sku-preview-table th { color: #888; font-weight: 600; font-size: 10px;
              letter-spacing: 0.14em; text-transform: uppercase; }
            .qt-sku-preview-table tr.err td { background: #fdece6; color: #c94628; }
          `,
        }}
      />

      {/* ── TOOLBAR ── */}
      <div className="qt-sku-card">
        <div className="qt-sku-toolbar">
          <div className="qt-sku-toolbar-left">
            <div className="qt-sku-title">SKU Master</div>
            <div className="qt-sku-sub">
              Central catalogue — 40 columns mirroring your SKU Master.xlsx.{" "}
              {isAdmin
                ? "Inline edit, or bulk-import from Excel."
                : "Read-only — only admins can add, edit, import, or delete SKUs."}
            </div>
          </div>
          <div className="qt-sku-actions">
            <button type="button" className="qt-sku-btn ghost" onClick={load} disabled={loading}>
              ↻ Refresh
            </button>
            <button
              type="button"
              className="qt-sku-btn ghost"
              onClick={() => downloadSkuMasterTemplate()}
            >
              ⬇ Download Template
            </button>
            {isAdmin && (
              <>
                <button
                  type="button"
                  className="qt-sku-btn ghost"
                  onClick={() => fileInputRef.current?.click()}
                >
                  ⬆ Bulk Upload
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  style={{ display: "none" }}
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
                <button type="button" className="qt-sku-btn accent" onClick={addBlankDraft}>
                  + Add Row
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {msg && <div className={`qt-sku-msg ${msg.kind}`}>{msg.text}</div>}
      {error && <div className="qt-sku-msg err">{error}</div>}

      {/* ── TABLE ── */}
      <div className="qt-sku-card" style={{ padding: 0 }}>
        <div className="qt-sku-tablewrap">
          <table className="qt-sku-table">
            <thead>
              {/* Section row */}
              <tr className="sections">
                {SECTION_SPANS.map((span, i) => (
                  <th
                    key={i}
                    colSpan={span.end - span.start + 1}
                    style={{ background: SECTION_BG[span.section], color: "#3a4a5c" }}
                  >
                    {SECTION_LABEL[span.section]}
                  </th>
                ))}
                <th
                  className="actions-cell"
                  style={{ background: "#f6f3ec", color: "#3a4a5c" }}
                  rowSpan={2}
                >
                  Actions
                </th>
              </tr>
              {/* Column row */}
              <tr className="cols">
                {SKU_COLUMNS.map((col) => (
                  <th
                    key={col.key as string}
                    style={{ background: SECTION_BG[col.section], minWidth: (col.width ?? 12) * 7 }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* Draft (unsaved) rows */}
              {drafts.map((d) => (
                <tr key={d._localId} className="draft">
                  {SKU_COLUMNS.map((col) => (
                    <td key={col.key as string} className={col.type === "text" ? "" : "num"}>
                      {renderCell(d, d, col, (val) => patchDraft(d._localId, col.key, val))}
                    </td>
                  ))}
                  <td className="actions-cell">
                    <div className="row-actions">
                      <button
                        type="button"
                        className="qt-sku-btn"
                        onClick={() => saveDraft(d._localId)}
                        disabled={busyId === d._localId}
                      >
                        {busyId === d._localId ? "Saving…" : "Done"}
                      </button>
                      <button
                        type="button"
                        className="qt-sku-btn ghost"
                        onClick={() => discardDraft(d._localId)}
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {/* Existing rows */}
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={SKU_COLUMNS.length + 1} className="qt-sku-empty">
                    Loading SKUs…
                  </td>
                </tr>
              ) : rows.length === 0 && drafts.length === 0 ? (
                <tr>
                  <td colSpan={SKU_COLUMNS.length + 1} className="qt-sku-empty">
                    {isAdmin ? (
                      <>
                        No SKUs yet. Click <strong>+ Add Row</strong> or upload an Excel template above.
                      </>
                    ) : (
                      <>No SKUs in the catalogue yet. Ask an admin to add some.</>
                    )}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const id = row.id!;
                  const draft = editing[id];
                  const isEditing = !!draft;
                  return (
                    <tr key={id} className={isEditing ? "editing" : ""}>
                      {SKU_COLUMNS.map((col) => (
                        <td
                          key={col.key as string}
                          className={[
                            col.type === "text" ? "" : "num",
                            col.key === "item_code" && !isEditing ? "code-cell" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {renderCell(
                            row,
                            isEditing ? draft : null,
                            col,
                            isEditing ? (val) => patchEdit(id, col.key, val) : null,
                          )}
                        </td>
                      ))}
                      <td className="actions-cell">
                        <div className="row-actions">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="qt-sku-btn"
                                onClick={() => saveEdit(id)}
                                disabled={busyId === id}
                              >
                                {busyId === id ? "Saving…" : "Done"}
                              </button>
                              <button
                                type="button"
                                className="qt-sku-btn ghost"
                                onClick={() => cancelEdit(id)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : isAdmin ? (
                            <>
                              <button
                                type="button"
                                className="qt-sku-btn ghost"
                                onClick={() => startEdit(row)}
                                disabled={busyId === id}
                              >
                                ✎ Edit
                              </button>
                              {canDelete && (
                                <button
                                  type="button"
                                  className="qt-sku-btn danger"
                                  onClick={() => handleDelete(row)}
                                  disabled={busyId === id}
                                >
                                  🗑
                                </button>
                              )}
                            </>
                          ) : (
                            <span style={{ fontSize: 11, color: "#aaa", fontStyle: "italic" }}>
                              Read-only
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── IMPORT PREVIEW MODAL ── */}
      {previewing && (
        <div className="qt-sku-preview-overlay">
          <div className="qt-sku-preview">
            <div className="qt-sku-preview-head">
              <h3>
                Review import — {previewing.filter((p) => p.ok).length} valid /{" "}
                {previewing.filter((p) => !p.ok).length} errors
              </h3>
              <button
                type="button"
                className="qt-sku-btn ghost"
                onClick={() => setPreviewing(null)}
              >
                ✕ Close
              </button>
            </div>
            <div className="qt-sku-preview-body">
              <table className="qt-sku-preview-table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>Row</th>
                    <th>Item Code</th>
                    <th>Description</th>
                    <th>Group</th>
                    <th style={{ textAlign: "right" }}>Case Pack</th>
                    <th style={{ textAlign: "right" }}>Unit lb</th>
                    <th style={{ textAlign: "right" }}>Cases/Pallet</th>
                  </tr>
                </thead>
                <tbody>
                  {previewing.map((p) => (
                    <tr key={p.row} className={p.ok ? "" : "err"}>
                      <td>{p.row}</td>
                      <td>{p.ok ? p.data?.item_code : "—"}</td>
                      <td>{p.ok ? p.data?.item_description || "—" : p.error}</td>
                      <td>{p.ok ? p.data?.group_name || "—" : ""}</td>
                      <td style={{ textAlign: "right" }}>
                        {p.ok ? p.data?.case_pack ?? "—" : ""}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {p.ok ? p.data?.unit_net_wt_lb ?? "—" : ""}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {p.ok ? p.data?.pallet_cases_per_pallet ?? "—" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="qt-sku-preview-foot">
              <button
                type="button"
                className="qt-sku-btn ghost"
                onClick={() => setPreviewing(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="qt-sku-btn accent"
                onClick={confirmImport}
                disabled={importing || previewing.filter((p) => p.ok).length === 0}
              >
                {importing
                  ? "Importing…"
                  : `✓ Import ${previewing.filter((p) => p.ok).length} SKU${
                      previewing.filter((p) => p.ok).length === 1 ? "" : "s"
                    }`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
