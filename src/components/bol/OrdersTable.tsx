"use client";

import type { BolOrder } from "@/lib/types";

const EMPTY: BolOrder = { order: "", pkgs: 0, weight: 0, pallet: true, info: "", wms: "" };

export function OrdersTable({
  orders: ordersProp,
  onChange,
}: {
  orders: BolOrder[] | undefined;
  onChange: (orders: BolOrder[]) => void;
}) {
  // Guard against a legacy `bol_form: {}` that didn't include the order
  // arrays — without this, reduce() throws "Cannot read properties of
  // undefined (reading 'reduce')" and crashes the whole dashboard.
  const orders = Array.isArray(ordersProp) ? ordersProp : [];

  function update(idx: number, patch: Partial<BolOrder>) {
    onChange(orders.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }
  function remove(idx: number) {
    onChange(orders.filter((_, i) => i !== idx));
  }
  function add(count = 1) {
    onChange([...orders, ...Array.from({ length: count }, () => ({ ...EMPTY }))]);
  }

  const totPkgs = orders.reduce((s, o) => s + (o.pkgs || 0), 0);
  const totWt = orders.reduce((s, o) => s + (o.weight || 0), 0);

  return (
    <>
      <div className="orders-table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}>#</th>
              <th>Customer Order #</th>
              <th># Pkgs</th>
              <th>Weight</th>
              <th>Pallet?</th>
              <th style={{ minWidth: 160 }}>Shipper Info</th>
              <th style={{ minWidth: 120 }}>WMS #</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: "center", color: "var(--muted)", fontSize: 11 }}>
                  {idx + 1}
                </td>
                <td>
                  <input
                    type="text"
                    value={o.order}
                    onChange={(e) => update(idx, { order: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={o.pkgs}
                    onChange={(e) => update(idx, { pkgs: parseInt(e.target.value) || 0 })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={o.weight}
                    onChange={(e) => update(idx, { weight: parseInt(e.target.value) || 0 })}
                  />
                </td>
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={o.pallet}
                    onChange={(e) => update(idx, { pallet: e.target.checked })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={o.info}
                    onChange={(e) => update(idx, { info: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    value={o.wms}
                    onChange={(e) => update(idx, { wms: e.target.value })}
                  />
                </td>
                <td>
                  <button className="btn-remove" onClick={() => remove(idx)}>
                    x
                  </button>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", color: "#bbb", padding: 16 }}>
                  No orders — click &quot;Add Order&quot; or &quot;Sync from Summary&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn-add" onClick={() => add(1)}>
          + Add Order
        </button>
        <button className="btn-add" onClick={() => add(5)}>
          + Add 5
        </button>
      </div>
      <div className="totals-bar">
        <div className="total-item">
          <span className="t-label">Total Pkgs</span>
          <span className="t-val">{totPkgs.toLocaleString()}</span>
        </div>
        <div className="total-item">
          <span className="t-label">Total Weight</span>
          <span className="t-val">{totWt.toLocaleString()}</span>
        </div>
        <div className="total-item">
          <span className="t-label">Orders</span>
          <span className="t-val">{orders.length}</span>
        </div>
      </div>
    </>
  );
}
