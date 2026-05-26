"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentUser } from "@/components/UserContext";
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_LABEL,
  ROLE_LABEL,
  defaultOperatorPermissions,
  type PermissionKey,
  type Permissions,
  type UserRole,
} from "@/lib/auth/permissions";

interface PublicUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  permissions: Permissions;
  created_at: string | null;
}

export default function SettingsTab() {
  const me = useCurrentUser();

  const [users, setUsers] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Create-user form state
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("operator");
  const [newPerms, setNewPerms] = useState<Permissions>(defaultOperatorPermissions());
  const [creating, setCreating] = useState(false);

  // Per-row inline state
  const [resetForId, setResetForId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/users");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load users.");
      setUsers(json.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  function flash(kind: "ok" | "err", text: string) {
    setMsg({ kind, text });
    window.setTimeout(() => setMsg(null), 4000);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role: newRole,
          permissions: newRole === "operator" ? newPerms : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create user.");
      flash("ok", `✓ User “${newEmail}” created.`);
      setNewEmail("");
      setNewPassword("");
      setNewRole("operator");
      setNewPerms(defaultOperatorPermissions());
      await loadUsers();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Failed to create user.");
    } finally {
      setCreating(false);
    }
  }

  async function patchUser(id: string, body: { role?: UserRole; permissions?: Partial<Permissions> }) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed.");
      flash("ok", "✓ Updated.");
      await loadUsers();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleResetPassword(id: string) {
    if (resetPassword.length < 8) {
      flash("err", "Password must be at least 8 characters.");
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/users/${id}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: resetPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Reset failed.");
      flash("ok", "✓ Password reset.");
      setResetForId(null);
      setResetPassword("");
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Reset failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(u: PublicUser) {
    if (u.id === me.id) {
      flash("err", "You can't delete your own account.");
      return;
    }
    if (!window.confirm(`Delete user “${u.username}”? This cannot be undone.`)) return;
    setBusyId(u.id);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Delete failed.");
      flash("ok", `✓ Deleted user “${u.username}”.`);
      await loadUsers();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  // Block non-admins entirely (shouldn't happen — sidebar hides this, but defensive)
  if (me.role !== "admin") {
    return (
      <div className="qt-settings-locked">
        <h3>Admin only</h3>
        <p>You need an admin role to manage users. Ask an existing admin to grant access.</p>
        <style
          dangerouslySetInnerHTML={{
            __html: `
              .qt-settings-locked {
                background: #fff; border: 1px solid #e6e0d4; border-radius: 14px;
                padding: 38px 32px; text-align: center; color: #6e6960;
              }
              .qt-settings-locked h3 {
                font-family: Georgia, serif; color: #25303f; margin: 0 0 8px;
              }
            `,
          }}
        />
      </div>
    );
  }

  return (
    <div className="qt-settings">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .qt-settings { display: flex; flex-direction: column; gap: 18px; }
            .qt-settings-card {
              background: #fff;
              border: 1px solid #e6e0d4;
              border-radius: 14px;
              padding: 22px 24px;
            }
            .qt-settings-head {
              display: flex; align-items: center; justify-content: space-between;
              margin-bottom: 16px;
            }
            .qt-settings-title {
              font-family: Georgia, serif; font-size: 16px; font-weight: 700; color: #1a2a3a;
            }
            .qt-settings-sub {
              font-size: 12px; color: #6e6960; margin-top: 3px; line-height: 1.5;
            }
            .qt-settings-msg {
              padding: 10px 14px; border-radius: 8px; font-size: 12.5px; margin-bottom: 14px;
            }
            .qt-settings-msg.ok  { background: #e8f6ee; color: #1e7a4a; }
            .qt-settings-msg.err { background: #fdece6; color: #c94628; }

            .qt-form-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: 12px; align-items: end; }
            .qt-form-field { display: flex; flex-direction: column; gap: 6px; }
            .qt-form-field label {
              font-size: 10.5px; font-weight: 600; letter-spacing: 0.4px;
              text-transform: uppercase; color: #6e6960;
            }
            .qt-form-field input, .qt-form-field select {
              padding: 9px 12px;
              border: 1.5px solid #e6e0d4;
              border-radius: 8px;
              background: #f6f3ec;
              font-size: 13px;
              color: #25303f;
              font-family: inherit;
              outline: none;
              transition: border-color 0.15s, background 0.15s;
            }
            .qt-form-field input:focus, .qt-form-field select:focus {
              border-color: #0e3a66; background: #fff;
            }
            .qt-perm-grid {
              display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 14px;
              padding: 14px; border: 1px dashed #e6e0d4; border-radius: 10px; background: #fbf9f4;
            }
            .qt-perm-grid.disabled { opacity: 0.5; pointer-events: none; }
            .qt-perm-row { display: flex; gap: 8px; align-items: center; font-size: 12.5px; color: #25303f; }
            .qt-perm-row input { width: 16px; height: 16px; accent-color: #0e3a66; }
            .qt-btn {
              padding: 10px 18px; background: #0e3a66; color: #fff; border: none;
              border-radius: 8px; font-size: 12.5px; font-weight: 600;
              letter-spacing: 0.3px; cursor: pointer; font-family: inherit;
              transition: background 0.15s, transform 0.15s;
            }
            .qt-btn:hover { background: #082a4f; transform: translateY(-1px); }
            .qt-btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
            .qt-btn.danger { background: #c94628; }
            .qt-btn.danger:hover { background: #a73a20; }
            .qt-btn.ghost {
              background: transparent; color: #0e3a66; border: 1px solid #e6e0d4;
            }
            .qt-btn.ghost:hover { background: #f0ede6; }

            .qt-users-table { width: 100%; border-collapse: collapse; font-size: 13px; }
            .qt-users-table thead th {
              background: transparent; color: #888; font-size: 10px;
              font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase;
              padding: 10px 12px; text-align: left;
              border-bottom: 1px solid #f0ede6; white-space: nowrap;
            }
            .qt-users-table tbody td {
              padding: 14px 12px; border-bottom: 1px solid #f3eee5; vertical-align: middle;
            }
            .qt-users-table tbody tr:last-child td { border-bottom: none; }
            .qt-users-table tbody tr:hover td { background: #fbf9f4; }
            .qt-role-pill {
              display: inline-flex; align-items: center; gap: 6px;
              padding: 3px 10px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.4px;
              border-radius: 999px;
            }
            .qt-role-pill.admin    { background: #fdf2dc; color: #a47712; }
            .qt-role-pill.operator { background: #eef3fa; color: #0e3a66; }
            .qt-username {
              font-weight: 700; color: #0e3a66; font-size: 13px;
            }
            .qt-username .you {
              font-size: 9.5px; background: #e8f6ee; color: #1e7a4a;
              padding: 2px 6px; border-radius: 999px; letter-spacing: 0.4px;
              margin-left: 6px; font-weight: 600;
            }
            .qt-perm-summary {
              display: flex; flex-wrap: wrap; gap: 4px;
            }
            .qt-perm-chip {
              font-size: 9.5px; font-weight: 600; letter-spacing: 0.3px;
              padding: 2px 7px; border-radius: 999px;
              background: #eef3fa; color: #0e3a66;
            }
            .qt-perm-chip.off { background: #f0ede6; color: #aaa; text-decoration: line-through; }
            .qt-row-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
            .qt-row-actions .qt-btn { padding: 6px 11px; font-size: 11px; font-weight: 600; }
            .qt-reset-inline {
              display: flex; gap: 6px; align-items: center;
              padding-top: 8px; margin-top: 8px; border-top: 1px dashed #e6e0d4;
            }
            .qt-reset-inline input {
              padding: 6px 10px; border: 1.5px solid #e6e0d4; border-radius: 6px;
              font-size: 12px; font-family: inherit; outline: none;
            }

            @media (max-width: 900px) {
              .qt-form-row { grid-template-columns: 1fr; }
              .qt-perm-grid { grid-template-columns: 1fr 1fr; }
            }
          `,
        }}
      />

      {/* ── CREATE USER ── */}
      <div className="qt-settings-card">
        <div className="qt-settings-head">
          <div>
            <div className="qt-settings-title">Create a new user</div>
            <div className="qt-settings-sub">
              Sub-level users log in with the email and password you set here.
              Accounts are created pre-confirmed, so no verification email is sent.
            </div>
          </div>
        </div>

        {msg && <div className={`qt-settings-msg ${msg.kind}`}>{msg.text}</div>}

        <form onSubmit={handleCreate}>
          <div className="qt-form-row">
            <div className="qt-form-field">
              <label>Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value.toLowerCase())}
                placeholder="e.g. priya@hovers.in"
                required
                autoComplete="off"
              />
            </div>
            <div className="qt-form-field">
              <label>Password (min. 8 chars)</label>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Set a strong password"
                minLength={8}
                required
                autoComplete="new-password"
              />
            </div>
            <div className="qt-form-field">
              <label>Role</label>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)}>
                <option value="operator">Operator</option>
                <option value="admin">Admin (full access)</option>
              </select>
            </div>
          </div>

          <div className={`qt-perm-grid ${newRole === "admin" ? "disabled" : ""}`}>
            {ALL_PERMISSION_KEYS.map((k) => (
              <label key={k} className="qt-perm-row">
                <input
                  type="checkbox"
                  checked={newRole === "admin" ? true : newPerms[k]}
                  onChange={(e) => setNewPerms({ ...newPerms, [k]: e.target.checked })}
                  disabled={newRole === "admin"}
                />
                {PERMISSION_LABEL[k]}
              </label>
            ))}
          </div>

          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
            <button type="submit" className="qt-btn" disabled={creating}>
              {creating ? "Creating…" : "+ Create User"}
            </button>
          </div>
        </form>
      </div>

      {/* ── USERS LIST ── */}
      <div className="qt-settings-card">
        <div className="qt-settings-head">
          <div>
            <div className="qt-settings-title">Users ({users.length})</div>
            <div className="qt-settings-sub">
              Click checkboxes to toggle a user&apos;s tab access — changes save when you click Save.
            </div>
          </div>
          <button type="button" className="qt-btn ghost" onClick={loadUsers} disabled={loading}>
            ↻ Refresh
          </button>
        </div>

        {error && <div className="qt-settings-msg err">{error}</div>}
        {loading && <div style={{ color: "#aaa", fontStyle: "italic", padding: 14 }}>Loading…</div>}

        {!loading && users.length > 0 && (
          <table className="qt-users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Permissions</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  isMe={u.id === me.id}
                  busy={busyId === u.id}
                  resetActive={resetForId === u.id}
                  resetPassword={resetPassword}
                  setResetPassword={setResetPassword}
                  onPatch={(body) => patchUser(u.id, body)}
                  onStartReset={() => {
                    setResetForId(u.id);
                    setResetPassword("");
                  }}
                  onCancelReset={() => {
                    setResetForId(null);
                    setResetPassword("");
                  }}
                  onResetPassword={() => handleResetPassword(u.id)}
                  onDelete={() => handleDelete(u)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function UserRow({
  user,
  isMe,
  busy,
  resetActive,
  resetPassword,
  setResetPassword,
  onPatch,
  onStartReset,
  onCancelReset,
  onResetPassword,
  onDelete,
}: {
  user: PublicUser;
  isMe: boolean;
  busy: boolean;
  resetActive: boolean;
  resetPassword: string;
  setResetPassword: (v: string) => void;
  onPatch: (body: { role?: UserRole; permissions?: Partial<Permissions> }) => Promise<void>;
  onStartReset: () => void;
  onCancelReset: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftRole, setDraftRole] = useState<UserRole>(user.role);
  const [draftPerms, setDraftPerms] = useState<Permissions>(user.permissions);

  function startEdit() {
    setDraftRole(user.role);
    setDraftPerms(user.permissions);
    setEditing(true);
  }
  async function saveEdit() {
    await onPatch({
      role: draftRole,
      permissions: draftRole === "operator" ? draftPerms : undefined,
    });
    setEditing(false);
  }

  return (
    <tr>
      <td>
        <span className="qt-username">
          {user.username}
          {isMe && <span className="you">YOU</span>}
        </span>
      </td>
      <td>
        {editing ? (
          <select
            value={draftRole}
            onChange={(e) => setDraftRole(e.target.value as UserRole)}
            style={{
              padding: "5px 9px",
              fontSize: 12,
              border: "1.5px solid #e6e0d4",
              borderRadius: 6,
              fontFamily: "inherit",
            }}
          >
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
        ) : (
          <span className={`qt-role-pill ${user.role}`}>{ROLE_LABEL[user.role]}</span>
        )}
      </td>
      <td>
        {editing && draftRole === "operator" ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            {ALL_PERMISSION_KEYS.map((k) => (
              <label
                key={k}
                style={{ display: "flex", gap: 5, alignItems: "center", fontSize: 11.5 }}
              >
                <input
                  type="checkbox"
                  checked={draftPerms[k]}
                  onChange={(e) => setDraftPerms({ ...draftPerms, [k]: e.target.checked })}
                  style={{ accentColor: "#0e3a66" }}
                />
                {PERMISSION_LABEL[k]}
              </label>
            ))}
          </div>
        ) : user.role === "admin" ? (
          <div className="qt-perm-summary">
            <span className="qt-perm-chip">All access</span>
          </div>
        ) : (
          <div className="qt-perm-summary">
            {ALL_PERMISSION_KEYS.map((k) => (
              <span key={k} className={`qt-perm-chip ${user.permissions[k] ? "" : "off"}`}>
                {PERMISSION_LABEL[k]}
              </span>
            ))}
          </div>
        )}
        {resetActive && (
          <div className="qt-reset-inline">
            <input
              type="text"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
              autoComplete="new-password"
              style={{ flex: 1, minWidth: 0 }}
            />
            <button
              type="button"
              className="qt-btn"
              onClick={onResetPassword}
              disabled={busy || resetPassword.length < 8}
            >
              {busy ? "Saving…" : "Set"}
            </button>
            <button type="button" className="qt-btn ghost" onClick={onCancelReset}>
              Cancel
            </button>
          </div>
        )}
      </td>
      <td>
        <div className="qt-row-actions">
          {editing ? (
            <>
              <button type="button" className="qt-btn" onClick={saveEdit} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="qt-btn ghost"
                onClick={() => setEditing(false)}
                disabled={busy}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" className="qt-btn ghost" onClick={startEdit} disabled={busy}>
                Edit
              </button>
              <button
                type="button"
                className="qt-btn ghost"
                onClick={onStartReset}
                disabled={busy || resetActive}
              >
                Reset Password
              </button>
              {!isMe && (
                <button
                  type="button"
                  className="qt-btn danger"
                  onClick={onDelete}
                  disabled={busy}
                >
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
