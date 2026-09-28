"use client";

import type { LabelFormat } from "@/lib/types";

const FIELDS: { key: keyof LabelFormat; label: string; select?: boolean }[] = [
  { key: "dept", label: "Dept suffix" },
  { key: "vendorLabel", label: "Vendor Style label" },
  { key: "unitsLabel", label: "Total Units label" },
  { key: "unitsVal", label: "Total Units value" },
  { key: "stock", label: "Stock Ready", select: true },
  { key: "pretick", label: "Preticketed", select: true },
  { key: "country", label: "Country of Origin" },
];

export default function LabelFields({ value, onChange }: {
  value: LabelFormat;
  onChange: (patch: Partial<LabelFormat>) => void;
}) {
  return <>{FIELDS.map(({ key, label, select }) => (
    <label className="label-field-row" key={key}>
      <span style={{ width: 160, flexShrink: 0, fontSize: 11, fontWeight: 600 }}>{label}</span>
      {select ? <select value={value[key]} onChange={e => onChange({ [key]: e.target.value })}>
        <option>No</option><option>Yes</option>
      </select> : <input maxLength={100} value={value[key]} onChange={e => onChange({ [key]: e.target.value })} />}
    </label>
  ))}</>;
}
