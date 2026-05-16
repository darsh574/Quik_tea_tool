// ─────────────────────────────────────────────────────────────────────────────
// User roles + per-tab permissions.
//
// Stored inside Supabase Auth's user_metadata so we don't need a separate table:
//   user.user_metadata = { username, role, permissions }
//
// Role precedence: admins implicitly have every permission, regardless of what's
// stored in `permissions`. Operators use the explicit permissions map.
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = "admin" | "operator";

/** One toggle per top-level tab in the dashboard sidebar. */
export interface Permissions {
  canDashboard: boolean;
  canRouting: boolean;
  canLabels: boolean;
  canBol: boolean;
  canAmazon: boolean;
  canHistory: boolean;
  canSkuMaster: boolean;
}

export type PermissionKey = keyof Permissions;

export const ALL_PERMISSION_KEYS: PermissionKey[] = [
  "canDashboard",
  "canRouting",
  "canLabels",
  "canBol",
  "canAmazon",
  "canHistory",
  "canSkuMaster",
];

/** Sensible default for a fresh operator — full access except they can't manage users. */
export function defaultOperatorPermissions(): Permissions {
  return {
    canDashboard: true,
    canRouting: true,
    canLabels: true,
    canBol: true,
    canAmazon: false,
    canHistory: true,
    canSkuMaster: true,
  };
}

/** Admins are implicitly all-yes, regardless of what's stored. */
export function allPermissions(): Permissions {
  return {
    canDashboard: true,
    canRouting: true,
    canLabels: true,
    canBol: true,
    canAmazon: true,
    canHistory: true,
    canSkuMaster: true,
  };
}

/** Pull a normalised Permissions object out of arbitrary user_metadata input. */
export function readPermissions(role: UserRole, raw: unknown): Permissions {
  if (role === "admin") return allPermissions();
  const r = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) ?? {};
  const def = defaultOperatorPermissions();
  return {
    canDashboard: typeof r.canDashboard === "boolean" ? r.canDashboard : def.canDashboard,
    canRouting: typeof r.canRouting === "boolean" ? r.canRouting : def.canRouting,
    canLabels: typeof r.canLabels === "boolean" ? r.canLabels : def.canLabels,
    canBol: typeof r.canBol === "boolean" ? r.canBol : def.canBol,
    canAmazon: typeof r.canAmazon === "boolean" ? r.canAmazon : def.canAmazon,
    canHistory: typeof r.canHistory === "boolean" ? r.canHistory : def.canHistory,
    canSkuMaster: typeof r.canSkuMaster === "boolean" ? r.canSkuMaster : def.canSkuMaster,
  };
}

export function readRole(raw: unknown): UserRole {
  return raw === "admin" ? "admin" : "operator";
}

/** Used by API routes to short-circuit when the caller isn't admin. */
export function isAdminMetadata(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  return (meta as { role?: unknown }).role === "admin";
}

/** Pretty label for the role pill / select. */
export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  operator: "Operator",
};

/** Labels shown next to each permission checkbox. */
export const PERMISSION_LABEL: Record<PermissionKey, string> = {
  canDashboard: "Dashboard",
  canRouting: "Routing",
  canLabels: "Label Generator",
  canBol: "Bill of Lading",
  canAmazon: "Amazon",
  canHistory: "History",
  canSkuMaster: "SKU Master",
};
