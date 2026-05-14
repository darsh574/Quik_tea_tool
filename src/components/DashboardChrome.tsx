"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useShipmentStore } from "@/store/useShipmentStore";
import { BRAND_CONFIG } from "@/lib/constants";
import type { BrandKey, TabKey } from "@/lib/types";
import AssistantWidget from "@/components/AssistantWidget";

const NAV: { tab: TabKey; label: string }[] = [
  { tab: "routing", label: "1 · Routing" },
  { tab: "labels", label: "2 · Label Generator" },
  { tab: "bol", label: "3 · Bill of Lading" },
  { tab: "amazon", label: "4 · Amazon API" },
  { tab: "history", label: "History" },
];

const BRANDS: BrandKey[] = ["homegoods", "tjx", "marshalls"];

export default function DashboardChrome({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const activeBrand = useShipmentStore((s) => s.activeBrand);
  const setActiveBrand = useShipmentStore((s) => s.setActiveBrand);
  const activeTab = useShipmentStore((s) => s.activeTab);
  const setActiveTab = useShipmentStore((s) => s.setActiveTab);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div style={{ padding: "28px 16px 64px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {/* ── Header ── */}
        <div style={{ background: "var(--navy)", borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              padding: "20px 32px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: "linear-gradient(135deg,#1A5088,#E8593C)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontWeight: 800,
                fontSize: 18,
                fontFamily: "Georgia, serif",
              }}
            >
              Q
            </div>
            <div style={{ flex: 1 }}>
              <h1
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: 21,
                  fontWeight: 700,
                  color: "#fff",
                  margin: 0,
                }}
              >
                QuikT Tool
              </h1>
              <p style={{ fontSize: 11.5, color: "rgba(255,255,255,0.55)", margin: "3px 0 0" }}>
                Routing → Labels → Bill of Lading · history saved per PO
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                Signed in as <strong style={{ color: "#fff" }}>{username}</strong>
              </span>
              <button
                onClick={signOut}
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  color: "#fff",
                  padding: "6px 14px",
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Sign Out
              </button>
            </div>
          </div>

          {/* ── Brand tabs ── */}
          <div style={{ display: "flex", padding: "0 28px", gap: 6, background: "var(--navy)" }}>
            {BRANDS.map((b) => {
              const active = activeBrand === b;
              return (
                <button
                  key={b}
                  onClick={() => setActiveBrand(b)}
                  style={{
                    padding: "10px 22px",
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: "0.5px",
                    color: active ? "#fff" : "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    borderRadius: "8px 8px 0 0",
                    background: active ? "var(--orange)" : "transparent",
                    border: "none",
                    fontFamily: "inherit",
                  }}
                >
                  {BRAND_CONFIG[b].label}
                </button>
              );
            })}
          </div>

          {/* ── Nav tabs ── */}
          <div
            style={{
              display: "flex",
              background: "var(--navy-dk)",
              padding: "0 28px",
              borderTop: "2px solid rgba(255,255,255,0.06)",
            }}
          >
            {NAV.map((item) => {
              const active = activeTab === item.tab;
              return (
                <button
                  key={item.tab}
                  onClick={() => setActiveTab(item.tab)}
                  style={{
                    padding: "13px 20px",
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.6px",
                    textTransform: "uppercase",
                    color: active ? "#fff" : "rgba(255,255,255,0.45)",
                    borderBottom: active ? "3px solid var(--orange)" : "3px solid transparent",
                    borderTop: "none",
                    borderLeft: "none",
                    borderRight: "none",
                    marginBottom: "-2px",
                    background: "transparent",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Panel content ── */}
        {children}
      </div>

      <AssistantWidget />
    </div>
  );
}
