// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/users
//   GET  → list all users (admin-only)
//   POST → create a new user (admin-only)
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  readPermissions,
  readRole,
  defaultOperatorPermissions,
  type Permissions,
  type UserRole,
} from "@/lib/auth/permissions";

const SYNTHETIC_DOMAIN = process.env.LOGIN_EMAIL_DOMAIN || "quikt.local";

function emailFromUsername(username: string) {
  return `${username.trim().toLowerCase()}@${SYNTHETIC_DOMAIN}`;
}

/** Loose-but-strict email pattern — rejects obviously invalid input but
 *  doesn't fight with edge-case but valid RFC addresses. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface PublicUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  permissions: Permissions;
  created_at: string | null;
}

function toPublicUser(u: {
  id: string;
  email?: string | null;
  created_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): PublicUser {
  const meta = u.user_metadata ?? {};
  const role = readRole(meta.role);
  const username =
    typeof meta.username === "string" && meta.username
      ? meta.username
      : (u.email ?? "").split("@")[0] || "(unknown)";
  return {
    id: u.id,
    email: u.email ?? "",
    username,
    role,
    permissions: readPermissions(role, meta.permissions),
    created_at: u.created_at ?? null,
  };
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error) throw error;
    const users = (data?.users ?? []).map(toPublicUser);
    // Sort: admins first, then by username
    users.sort((a, b) => {
      if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
      return a.username.localeCompare(b.username);
    });
    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list users." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: {
    email?: string;
    username?: string; // legacy — still accepted as a fallback
    password?: string;
    role?: string;
    permissions?: Partial<Permissions>;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const emailInput = (body.email ?? "").trim().toLowerCase();
  // Username-based fallback for older callers — synthesised to email.
  const usernameInput = (body.username ?? "").trim().toLowerCase();
  const email = emailInput || (usernameInput ? emailFromUsername(usernameInput) : "");
  const password = body.password ?? "";
  const role = readRole(body.role);

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  const permissions =
    role === "admin"
      ? undefined
      : { ...defaultOperatorPermissions(), ...(body.permissions ?? {}) };

  // Display-name in metadata defaults to the local-part of the email (so
  // existing UI that reads user_metadata.username keeps showing something
  // sensible — e.g. "priya@hovers.in" → "priya").
  const displayName =
    usernameInput || (email.split("@")[0] || "").replace(/[^a-z0-9._-]/g, "");

  try {
    const supabase = getAdminClient();
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username: displayName,
        role,
        ...(permissions ? { permissions } : {}),
      },
    });
    if (error) throw error;
    if (!data.user) throw new Error("User was not returned by Supabase.");
    return NextResponse.json({ user: toPublicUser(data.user) }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create user." },
      { status: 500 },
    );
  }
}
