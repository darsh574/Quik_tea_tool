// ─────────────────────────────────────────────────────────────────────────────
// API route guard — returns the calling user's id if they are signed in AND
// have role 'admin' in their user_metadata. Otherwise returns a NextResponse
// that the route should return immediately.
// ─────────────────────────────────────────────────────────────────────────────

import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminMetadata } from "@/lib/auth/permissions";

export async function requireAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }
  if (!isAdminMetadata(user.user_metadata)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin only." }, { status: 403 }),
    };
  }
  return { ok: true, userId: user.id };
}
