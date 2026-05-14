"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Internal tool: users sign in with a short username. We map it to a Supabase
// auth email (admin -> admin@quikt.local). Typing a full email also works.
const EMAIL_DOMAIN = "quikt.local";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const supabase = createClient();
    const email = username.includes("@") ? username.trim() : `${username.trim()}@${EMAIL_DOMAIN}`;
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(signInError.message || "Invalid username or password.");
      setLoading(false);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--cream)",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "var(--white)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 12px 40px rgba(26,80,136,0.12)",
        }}
      >
        <div style={{ background: "var(--navy)", padding: "26px 32px" }}>
          <h1
            style={{
              fontFamily: "Georgia, serif",
              fontSize: 22,
              fontWeight: 700,
              color: "#fff",
              margin: 0,
            }}
          >
            QuikT Tool
          </h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
            Shipment dashboard · sign in to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "26px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="field">
            <label>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div
              style={{
                background: "#fef2f2",
                color: "#c0392b",
                border: "1px solid #f5c0b8",
                borderRadius: 8,
                padding: "9px 12px",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          <button type="submit" className="btn-generate" disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>

          <p className="hint" style={{ textAlign: "center" }}>
            Default credentials: <strong>admin</strong> / <strong>admin123</strong> — change the
            password after first login.
          </p>
        </form>
      </div>
    </main>
  );
}
