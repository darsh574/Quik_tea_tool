// ─────────────────────────────────────────────────────────────────────────────
// Seed the default admin user.
//   Username: admin   Password: admin123   (login email: admin@quikt.local)
//
// Run once, after creating the Supabase project and filling .env.local:
//   node scripts/seed-admin.mjs
//
// Requires SUPABASE_SERVICE_ROLE_KEY (server-only key) in the environment.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Minimal .env.local loader (no dotenv dependency needed).
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  // no .env.local — rely on real environment variables
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "  Fill them in .env.local (copy from .env.example) and try again."
  );
  process.exit(1);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@quikt.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD,
  email_confirm: true,
  user_metadata: { username: "admin", role: "admin" },
});

if (error) {
  if (/already.*registered|exists/i.test(error.message)) {
    console.log(`✓ Admin user ${ADMIN_EMAIL} already exists — nothing to do.`);
    process.exit(0);
  }
  console.error("✗ Failed to create admin user:", error.message);
  process.exit(1);
}

console.log(`✓ Created admin user: ${ADMIN_EMAIL}  (id: ${data.user?.id})`);
console.log(`  Log in with username "admin" / password "${ADMIN_PASSWORD}".`);
console.log("  Change this password after first login.");
