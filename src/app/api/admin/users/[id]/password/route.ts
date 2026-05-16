// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/users/[id]/password
//   Reset a user's password (admin-only).
//   Body: { password: string }
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/requireAdmin";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const password = body.password ?? "";
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }

  try {
    const supabase = getAdminClient();
    const { error } = await supabase.auth.admin.updateUserById(params.id, { password });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reset password." },
      { status: 500 },
    );
  }
}
