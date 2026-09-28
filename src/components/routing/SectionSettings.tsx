"use client";

import { useShipmentStore } from "@/store/useShipmentStore";
import LabelFields from "@/components/labels/LabelFields";
import { getBrandConfig, isCustomBrand } from "@/lib/constants";

export default function SectionSettings() {
  const brand = useShipmentStore(s => s.activeBrand);
  const deleteSection = useShipmentStore(s => s.deleteSection);
  const shipment = useShipmentStore(s => s.brandState[s.activeBrand].sierra);
  const format = useShipmentStore(s => s.format);
  const setFormat = useShipmentStore(s => s.setFormat);
  const setSierra = useShipmentStore(s => s.setSierra);
  if (!shipment || !isCustomBrand(brand)) return null;
  const dc = shipment.dcs[0];
  return <>
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
      <button type="button" className="btn-sm" style={{ color: "#a32929", borderColor: "#e2baba" }}
        onClick={() => {
          if (window.confirm(`Delete the "${getBrandConfig(brand).label}" routing section?\n\nThis removes its tab, unsaved routing data, and label settings from this browser. Saved POs remain in History; loading one will restore the section.`)) {
            deleteSection(brand);
          }
        }}>Delete section</button>
    </div>
    <details className="card">
    <summary style={{ cursor: "pointer", fontWeight: 600 }}>Section label settings</summary>
    <p className="hint" style={{ margin: "12px 0" }}>Saved automatically for this section. You can also edit label content in the Label Generator.</p>
    <div className="row2">
      <div className="label-fields"><LabelFields value={format} onChange={setFormat} /></div>
      <div>
        <label className="field" style={{ display: "block", marginBottom: 12 }}>From (sender name)
          <input value={shipment.from ?? "Quikfoods Inc"} onChange={e => setSierra({ from: e.target.value })} />
        </label>
        {dc && ([['name', 'Ship-to name'], ['street', 'Street address'], ['city', 'City, State ZIP']] as const).map(([key, label]) => (
          <label className="field" key={key} style={{ display: "block", marginBottom: 12 }}>{label}
            <input value={dc[key] ?? ""} onChange={e => setSierra({ dcs: [{ ...dc, [key]: e.target.value }] })} />
          </label>
        ))}
      </div>
    </div>
  </details></>;
}
