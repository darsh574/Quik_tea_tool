"use client";

import { useShipmentStore } from "@/store/useShipmentStore";
import DashboardHome from "@/components/DashboardHome";
import RoutingTab from "@/components/routing/RoutingTab";
import LabelsTab from "@/components/labels/LabelsTab";
import BolTab from "@/components/bol/BolTab";
import AmazonTab from "@/components/amazon/AmazonTab";
import HistoryTab from "@/components/history/HistoryTab";
import SkuMasterTab from "@/components/skuMaster/SkuMasterTab";
import SettingsTab from "@/components/settings/SettingsTab";

// Single-page dashboard: all tabs live here and switch via client-side state
// (no route navigation, no per-click auth round-trip) — so switching is instant.
export default function DashboardTabs({ username }: { username: string }) {
  const activeTab = useShipmentStore((s) => s.activeTab);

  return (
    <>
      <div style={{ display: activeTab === "home" ? "block" : "none" }}>
        <DashboardHome username={username} />
      </div>
      <div style={{ display: activeTab === "routing" ? "block" : "none" }}>
        <RoutingTab />
      </div>
      <div style={{ display: activeTab === "labels" ? "block" : "none" }}>
        <LabelsTab />
      </div>
      <div style={{ display: activeTab === "bol" ? "block" : "none" }}>
        <BolTab />
      </div>
      <div style={{ display: activeTab === "amazon" ? "block" : "none" }}>
        <AmazonTab />
      </div>
      <div style={{ display: activeTab === "history" ? "block" : "none" }}>
        <HistoryTab />
      </div>
      <div style={{ display: activeTab === "sku-master" ? "block" : "none" }}>
        <SkuMasterTab />
      </div>
      <div style={{ display: activeTab === "settings" ? "block" : "none" }}>
        <SettingsTab />
      </div>
    </>
  );
}
