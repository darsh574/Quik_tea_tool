"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useShipmentStore } from "@/store/useShipmentStore";
import { useCurrentUser } from "@/components/UserContext";
import type { TabKey } from "@/lib/types";
import type { PermissionKey } from "@/lib/auth/permissions";
import AssistantWidget from "@/components/AssistantWidget";

type NavItem = {
  tab: TabKey;
  label: string;
  icon: React.ReactNode;
  permission?: PermissionKey;
  adminOnly?: boolean;
};

const NAV: NavItem[] = [
  {
    permission: "canDashboard",
    tab: "home",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    permission: "canRouting",
    tab: "routing",
    label: "Routing",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5" />
      </svg>
    ),
  },
  {
    permission: "canLabels",
    tab: "labels",
    label: "Label Generator",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" />
        <circle cx="7.5" cy="7.5" r="1.5" />
      </svg>
    ),
  },
  {
    permission: "canBol",
    tab: "bol",
    label: "Bill of Lading",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="16" y2="17" />
      </svg>
    ),
  },
  {
    permission: "canAmazon",
    tab: "amazon",
    label: "Amazon",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-5 9 5v6l-9 5-9-5z" />
        <line x1="3" y1="9" x2="12" y2="14" />
        <line x1="21" y1="9" x2="12" y2="14" />
        <line x1="12" y1="14" x2="12" y2="20" />
      </svg>
    ),
  },
  {
    permission: "canHistory",
    tab: "history",
    label: "History",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15.5 14" />
      </svg>
    ),
  },
  {
    permission: "canSkuMaster",
    tab: "sku-master",
    label: "SKU Master",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
        <line x1="3" y1="14" x2="21" y2="14" />
        <line x1="9" y1="4" x2="9" y2="20" />
        <line x1="15" y1="4" x2="15" y2="20" />
      </svg>
    ),
  },
  {
    adminOnly: true,
    tab: "settings",
    label: "Settings",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

const TITLES: Record<TabKey, { title: string; subtitle: string }> = {
  home: { title: "Quik Tea Dashboard", subtitle: "Manage your business operations" },
  routing: { title: "Routing", subtitle: "Import sheet · set PO · build the quantity matrix" },
  labels: { title: "Label Generator", subtitle: "Render 6×4 carton labels for the active PO" },
  bol: { title: "Bill of Lading", subtitle: "Compile the AcroForm BOL for a saved PO" },
  amazon: { title: "Amazon SP-API", subtitle: "Multi-region listings, orders & reports" },
  history: { title: "PO History", subtitle: "Search and recall any saved shipment" },
  "sku-master": { title: "SKU Master", subtitle: "Central catalogue · inline edit · Excel import" },
  settings: { title: "Settings", subtitle: "User management · roles · permissions" },
};

export default function DashboardChrome({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const activeTab = useShipmentStore((s) => s.activeTab);
  const setActiveTab = useShipmentStore((s) => s.setActiveTab);
  const user = useCurrentUser();

  const visibleNav = NAV.filter((item) => {
    if (item.adminOnly) return user.role === "admin";
    if (user.role === "admin") return true;
    if (!item.permission) return true;
    return user.permissions[item.permission];
  });

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const initials =
    username
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "U";

  const pretty = username.charAt(0).toUpperCase() + username.slice(1).toLowerCase();
  const title = TITLES[activeTab] ?? TITLES.home;

  return (
    <div className="qt-shell">
      <style dangerouslySetInnerHTML={{ __html: `
        .qt-shell {
          --side-bg: #0e3a66;
          --side-bg-dk: #082a4f;
          --side-fg: #f0ece4;
          --side-fg-mute: rgba(240, 236, 228, 0.55);
          --side-active-bg: #e8593c;
          --side-hover-bg: rgba(255,255,255,0.06);
          --top-border: #e6e0d4;
          --content-bg: #f6f3ec;
          display: grid;
          grid-template-columns: 240px minmax(0, 1fr);
          min-height: 100vh;
          background: var(--content-bg);
          overflow-x: hidden;
        }

        /* ── SIDEBAR ── */
        .qt-side {
          background: var(--side-bg);
          color: var(--side-fg);
          display: flex;
          flex-direction: column;
          position: sticky;
          top: 0;
          height: 100vh;
          padding: 22px 14px 18px;
          border-right: 1px solid rgba(0,0,0,0.04);
        }
        .qt-side-brand {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 8px 10px 26px;
          margin-bottom: 8px;
        }
        .qt-side-brand img {
          height: 60px;
          width: auto;
          display: block;
          filter: brightness(0) invert(1);
          opacity: 0.95;
        }
        .qt-side-brand-text {
          font-family: Georgia, "Times New Roman", serif;
          font-weight: 700;
          font-size: 16px;
          letter-spacing: 0.2px;
        }

        .qt-side-section {
          font-size: 9.5px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: var(--side-fg-mute);
          padding: 6px 12px 8px;
          font-weight: 600;
        }
        .qt-side-nav {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .qt-side-nav button {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          background: transparent;
          border: none;
          color: var(--side-fg);
          opacity: 0.78;
          font-family: inherit;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.1px;
          text-align: left;
          width: 100%;
          cursor: pointer;
          border-radius: 8px;
          transition: background 0.14s ease, opacity 0.14s ease, transform 0.14s ease;
        }
        .qt-side-nav button:hover {
          background: var(--side-hover-bg);
          opacity: 1;
        }
        .qt-side-nav button.active {
          background: var(--side-active-bg);
          opacity: 1;
          font-weight: 600;
          color: #fff;
          box-shadow: 0 4px 12px rgba(232, 89, 60, 0.28);
        }
        .qt-side-nav button.active svg {
          stroke: #fff;
        }

        .qt-side-spacer { flex: 1; }

        .qt-side-divider {
          height: 1px;
          background: rgba(255,255,255,0.08);
          margin: 10px 12px;
        }
        .qt-side-foot {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
        }
        .qt-side-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #e8593c, #f7a07a);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 12px;
          color: #fff;
          letter-spacing: 0.5px;
          flex-shrink: 0;
        }
        .qt-side-user {
          flex: 1;
          min-width: 0;
        }
        .qt-side-user-name {
          font-size: 12.5px;
          font-weight: 600;
          color: #fff;
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .qt-side-user-role {
          font-size: 10px;
          color: var(--side-fg-mute);
          letter-spacing: 0.4px;
          margin-top: 1px;
        }
        .qt-side-signout {
          background: transparent;
          border: 1px solid rgba(255,255,255,0.15);
          color: var(--side-fg);
          opacity: 0.7;
          padding: 6px;
          border-radius: 7px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 0.14s, opacity 0.14s;
        }
        .qt-side-signout:hover {
          background: rgba(255,255,255,0.08);
          opacity: 1;
        }

        /* ── MAIN ── */
        .qt-main {
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .qt-topbar {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 22px 32px;
          background: var(--content-bg);
          border-bottom: 1px solid var(--top-border);
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .qt-topbar-titles { flex: 1 1 auto; min-width: 0; overflow: hidden; }
        .qt-topbar h1 {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 22px;
          font-weight: 700;
          color: #1a1a1a;
          margin: 0;
          letter-spacing: -0.005em;
        }
        .qt-topbar p {
          margin: 3px 0 0;
          font-size: 12.5px;
          color: #6e6960;
        }
        .qt-search {
          position: relative;
          flex: 0 1 280px;
          min-width: 160px;
          max-width: 280px;
        }
        .qt-search input {
          width: 100%;
          padding: 9px 13px 9px 36px;
          background: #fff;
          border: 1px solid var(--top-border);
          border-radius: 9px;
          font-size: 13px;
          color: #1a1a1a;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
          font-family: inherit;
        }
        .qt-search input:focus {
          border-color: var(--side-bg);
          box-shadow: 0 0 0 3px rgba(14, 58, 102, 0.08);
        }
        .qt-search svg {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #999;
        }
        .qt-top-avatar {
          width: 38px;
          height: 38px;
          flex-shrink: 0;
          border-radius: 50%;
          background: linear-gradient(135deg, #1a5088, #143f6b);
          color: #fff;
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 0.5px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 6px rgba(20,63,107,0.18);
        }

        .qt-content {
          flex: 1;
          padding: 26px 32px 40px;
          max-width: 1280px;
          width: 100%;
          margin: 0 auto;
          box-sizing: border-box;
        }

        /* Tighten search well before the layout breaks */
        @media (max-width: 1100px) {
          .qt-topbar { padding: 18px 20px; }
          .qt-content { padding: 22px 20px 36px; }
          .qt-search { flex: 0 1 200px; min-width: 140px; }
        }

        @media (max-width: 860px) {
          .qt-topbar { flex-wrap: wrap; }
          .qt-search {
            flex: 1 1 100%;
            max-width: none;
            order: 3;
          }
        }

        @media (max-width: 800px) {
          .qt-shell {
            grid-template-columns: 1fr;
          }
          .qt-side {
            position: relative;
            height: auto;
            flex-direction: row;
            padding: 12px 16px;
            overflow-x: auto;
          }
          .qt-side-spacer, .qt-side-section, .qt-side-divider, .qt-side-foot { display: none; }
          .qt-side-nav { flex-direction: row; }
          .qt-side-brand { padding-bottom: 0; margin-right: 8px; }
          .qt-content { padding: 18px; }
        }
      ` }} />

      {/* ─── Sidebar ─── */}
      <aside className="qt-side">
        <div className="qt-side-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://quiktea.com/wp-content/uploads/2024/05/quiktea.png" alt="QuikTea" />
        </div>
        <div className="qt-side-section">Main Menu</div>
        <nav className="qt-side-nav">
          {visibleNav.map((item) => (
            <button
              key={item.tab}
              className={activeTab === item.tab ? "active" : ""}
              onClick={() => setActiveTab(item.tab)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="qt-side-spacer" />
        <div className="qt-side-divider" />
        <div className="qt-side-foot">
          <div className="qt-side-avatar">{initials}</div>
          <div className="qt-side-user">
            <div className="qt-side-user-name">{pretty}</div>
            <div className="qt-side-user-role">{user.role === "admin" ? "Admin" : "Operator"}</div>
          </div>
          <button className="qt-side-signout" onClick={signOut} title="Sign out">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </aside>

      {/* ─── Main ─── */}
      <main className="qt-main">
        <header className="qt-topbar">
          <div className="qt-topbar-titles">
            <h1>{title.title}</h1>
            <p>{title.subtitle}</p>
          </div>
          <div className="qt-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              placeholder="Search PO history…"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setActiveTab("history");
                }
              }}
            />
          </div>
          <div className="qt-top-avatar" title={pretty}>
            {initials}
          </div>
        </header>

        <section className="qt-content">{children}</section>
      </main>

      <AssistantWidget />
    </div>
  );
}
