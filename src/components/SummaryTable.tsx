"use client";

import type { SummaryData, DCSummary, SummaryTotals } from "@/lib/types";

type MetricKey = keyof Omit<DCSummary, "dc">;

interface Row {
  label: string;
  key: MetricKey;
  fmt: (v: number) => string | number;
  sep?: boolean;
}

// Row formatting matches renderSummaryTable() in the original tool exactly.
const ROWS: Row[] = [
  { label: "Units/DC 20 ct", key: "units20", fmt: (v) => Math.round(v) },
  { label: "Cases/DC 20 ct", key: "cases20", fmt: (v) => Math.round(v) },
  { label: "Units/DC 10 ct", key: "units10", fmt: (v) => Math.round(v) },
  { label: "Cases/DC 10 ct", key: "cases10", fmt: (v) => Math.round(v) },
  { label: "Total Cases", key: "totalCases", fmt: (v) => Math.round(v), sep: true },
  { label: "# Pallets", key: "pallets", fmt: (v) => Math.round(v), sep: true },
  { label: "Net Wt (lb)", key: "netWt", fmt: (v) => Math.ceil(v), sep: true },
  { label: "Pallet Wt (lb)", key: "palletWt", fmt: (v) => Math.round(v) },
  { label: "Total Gross Wt (lb)", key: "grossWt", fmt: (v) => Math.ceil(v) },
  { label: "Value ($)", key: "value", fmt: (v) => "$" + Math.ceil(v).toLocaleString("en-US") },
];

export function SummaryTable({ summary }: { summary: SummaryData }) {
  const { dcData, tot } = summary;

  return (
    <table>
      <thead>
        <tr>
          <th>Metric</th>
          {dcData.map((d) => (
            <th key={d.dc.num}>
              {d.dc.code}
              <span className="dc-sub">{d.dc.num}</span>
            </th>
          ))}
          <th style={{ background: "#2a2a2a" }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((r) => {
          const sepStyle: React.CSSProperties = r.sep
            ? { borderTop: "2px solid var(--border)" }
            : {};
          return (
            <tr key={r.key}>
              <td style={sepStyle}>{r.label}</td>
              {dcData.map((d) => (
                <td key={d.dc.num} style={{ textAlign: "center", ...sepStyle }}>
                  {r.fmt(d[r.key])}
                </td>
              ))}
              <td
                style={{
                  fontWeight: 700,
                  color: "#1a1a1a",
                  textAlign: "center",
                  ...sepStyle,
                }}
              >
                {r.fmt(tot[r.key as keyof SummaryTotals])}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
