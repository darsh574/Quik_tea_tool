"use client";

import { useEffect, useRef, useState } from "react";
import { useShipmentStore } from "@/store/useShipmentStore";
import { defaultLabelFormat } from "@/lib/labelFormat";
import LabelFields from "@/components/labels/LabelFields";

export default function CreateSection({ onClose }: { onClose: () => void }) {
  const addSection = useShipmentStore(s => s.addSection);
  const [name, setName] = useState("");
  const [format, setFormat] = useState({ ...defaultLabelFormat(), dept: "" });
  const [error, setError] = useState("");
  const [details, setDetails] = useState({ from: "Quikfoods Inc", to: "", street: "", city: "", poNumber: "", product: "" });
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="section-dialog" aria-labelledby="create-section-title" onCancel={onClose}>
    <style>{`
      .section-dialog { width: min(740px, calc(100vw - 32px)); max-height: calc(100dvh - 48px); padding: 0; border: 1px solid #e6e0d4; border-radius: 16px; color: var(--text); background: #fff; box-shadow: 0 24px 80px #11263d40; }
      .section-dialog::backdrop { background: #102a4566; }
      .section-dialog form { padding: 26px; }
      .section-dialog-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px; }
      .section-dialog .field { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; }
      .section-dialog input, .section-dialog select { min-width: 0; }
      @media (max-width: 560px) { .section-dialog-grid { grid-template-columns: 1fr; } .section-dialog form { padding: 18px; } }
    `}</style>
    <form aria-label="Create routing section" onSubmit={e => {
    e.preventDefault();
    try { addSection(name, format, details); onClose(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not create section."); }
  }}>
    <div className="section-title" id="create-section-title">New routing section</div>
    <p className="hint" style={{ marginBottom: 16 }}>Uses the same table, calculations, and label layout as Lotless. Each section keeps its own data and label settings.</p>
    <label className="field" style={{ display: "block", maxWidth: 480, marginBottom: 16 }}>
      <span>Section name</span>
      <input autoFocus required maxLength={60} placeholder="Enter retailer or customer name" value={name} onChange={e => { setName(e.target.value); setError(""); }} />
    </label>
    <div className="section-dialog-grid">
      {([
        ['from', 'From (sender name)', 'Quikfoods Inc'],
        ['to', 'To (distribution center)', `${name.trim() || 'Your section'} Distribution Center`],
        ['street', 'Street address', 'Street address'],
        ['city', 'City, State ZIP', 'City, State ZIP'],
        ['poNumber', 'PO number', 'Enter PO number (optional)'],
        ['product', 'Starting product / Vendor Style value', 'e.g. QT15 (optional)'],
      ] as const).map(([key, label, placeholder]) => <label className="field" key={key}>
        <span>{label}</span>
        <input maxLength={key === 'product' ? 40 : 100} value={details[key]} placeholder={placeholder} onChange={e => setDetails(d => ({ ...d, [key]: e.target.value }))} />
      </label>)}
    </div>
    <div className="label-fields" style={{ maxWidth: 480 }}>
      <LabelFields value={format} onChange={patch => setFormat(f => ({ ...f, ...patch }))} />
    </div>
    {error && <p role="alert" style={{ color: "#a32929" }}>{error}</p>}
    <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
      <button className="btn-generate" type="submit">Create section</button>
      <button className="btn-sm" type="button" onClick={onClose}>Cancel</button>
    </div>
  </form></dialog>;
}
