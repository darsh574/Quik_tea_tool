// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY Supabase admin client.
// Uses the SERVICE ROLE key — bypasses RLS and can call auth.admin.*.
// NEVER import this from a "use client" file or expose its results raw.
// ─────────────────────────────────────────────────────────────────────────────

import "server-only";
import { createClient as createAdminClient } from "@supabase/supabase-js";

let cached: ReturnType<typeof createAdminClient> | null = null;

export function getAdminClient() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — required for admin operations.",
    );
  }
  cached = createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
