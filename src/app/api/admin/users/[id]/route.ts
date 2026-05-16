// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/users/[id]
//   PATCH  → update role / permissions (admin-only)
//   DELETE → remove user (admin-only, can't delete yourself)
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import {
  readPermissions,
  readRole,
  defaultOperatorPermissions,
  type Permissions,
} from "@/lib/auth/permissions";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { role?: string; permissions?: Partial<Permissions> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const supabase = getAdminClient();
    // Read existing metadata so we can merge instead of overwrite blindly.
    const { data: existingData, error: getErr } = await supabase.auth.admin.getUserById(
      params.id,
    );
    if (getErr) throw getErr;
    const existing = existingData?.user;
    if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });

    const prevMeta = existing.user_metadata ?? {};
    const prevRole = readRole(prevMeta.role);
    const nextRole = body.role !== undefined ? readRole(body.role) : prevRole;

    const nextPermissions: Permissions =
      nextRole === "admin"
        ? defaultOperatorPermissions() // stored value irrelevant for admin
        : {
            ...readPermissions(prevRole, prevMeta.permissions),
            ...(body.permissions ?? {}),
          };

    const { data, error } = await supabase.auth.admin.updateUserById(params.id, {
      user_metadata: {
        ...prevMeta,
        role: nextRole,
        permissions: nextPermissions,
      },
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, user: data?.user });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update user." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  if (params.id === gate.userId) {
    return NextResponse.json(
      { error: "You can't delete your own account." },
      { status: 400 },
    );
  }

  try {
    const supabase = getAdminClient();
    const { error } = await supabase.auth.admin.deleteUser(params.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete user." },
      { status: 500 },
    );
  }
}
