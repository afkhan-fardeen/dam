"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Space, SpaceMembership, SpaceRole, Profile } from "@/lib/types";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { AdminModal } from "@/components/admin/AdminModal";
import { PasswordField } from "@/components/PasswordField";

function generatePassword() {
  const chars =
    "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
  let out = "";
  for (let i = 0; i < 12; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out + "aA1!";
}

type PendingRow = { key: string; space_id: string; role: SpaceRole };

export function AdminUsersClient() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [memberships, setMemberships] = useState<SpaceMembership[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [resetUser, setResetUser] = useState<Profile | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetShown, setResetShown] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createdCreds, setCreatedCreds] = useState<{
    email: string;
    password: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [usersRes, spacesRes] = await Promise.all([
      fetch("/api/admin/users"),
      fetch("/api/admin/spaces"),
    ]);
    const usersJson = await usersRes.json();
    const spacesJson = await spacesRes.json();
    if (usersRes.ok) {
      setUsers(usersJson.users as Profile[]);
      setMemberships(usersJson.memberships as SpaceMembership[]);
    }
    if (spacesRes.ok) setSpaces(spacesJson.spaces as Space[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q),
    );
  }, [users, query]);

  function openModal() {
    setEmail("");
    setFullName("");
    setPassword(generatePassword());
    setError(null);
    setCreatedCreds(null);
    const first = spaces[0];
    setRows(
      first
        ? [{ key: crypto.randomUUID(), space_id: first.id, role: "viewer" }]
        : [],
    );
    setModalOpen(true);
  }

  function addRow() {
    const unused = spaces.find((s) => !rows.some((r) => r.space_id === s.id));
    const spaceId = unused?.id || spaces[0]?.id;
    if (!spaceId) return;
    setRows((prev) => [
      ...prev,
      { key: crypto.randomUUID(), space_id: spaceId, role: "viewer" },
    ]);
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setCreatedCreds(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        full_name: fullName,
        password,
        memberships: rows.map(({ space_id, role }) => ({ space_id, role })),
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not create this person.");
      return;
    }
    setCreatedCreds({ email: json.email, password: json.password });
    await load();
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUser) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: resetUser.id,
        password: resetPassword,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not reset password.");
      return;
    }
    setResetShown(true);
  }

  async function changeRole(userId: string, spaceId: string, role: SpaceRole) {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        memberships: [{ space_id: spaceId, role }],
      }),
    });
    await load();
  }

  async function removeMembership(userId: string, spaceId: string) {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        remove_space_ids: [spaceId],
      }),
    });
    await load();
  }

  async function toggleActive(userId: string, isActive: boolean) {
    await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, is_active: isActive }),
    });
    await load();
  }

  async function viewAs(userId: string) {
    await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    window.location.href = "/";
  }

  const spaceName = (id: string) => spaces.find((b) => b.id === id)?.name || id;
  const spaceColor = (id: string) =>
    spaces.find((b) => b.id === id)?.color || "#6b7280";

  return (
    <div className="glass p-5 sm:p-6 flex flex-col gap-4">
      <AdminTabs />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          className="glass-input type-body px-2 py-1.5 rounded-xl bg-white/30 max-w-xs"
        />
        <button type="button" onClick={openModal} className="btn-glass-primary px-4 py-2 text-[13px] font-medium">
          New person
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        {filtered.map((u) => {
          const userMemberships = memberships.filter((m) => m.user_id === u.id);
          const inactive = u.is_active === false;
          return (
            <div
              key={u.id}
              className={`px-2 py-3 rounded-[12px] hover:bg-white/45 flex flex-col gap-2 ${
                inactive ? "opacity-45" : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="type-label">
                  {u.full_name || "Unnamed"}
                </p>
                <p className="type-caption text-[var(--ink-soft)]">{u.email}</p>
                {u.is_admin ? (
                  <span className="badge badge-neutral badge-sm">Admin</span>
                ) : null}
                <div className="ml-auto flex flex-wrap gap-1">
                  {!u.is_admin ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => void viewAs(u.id)}
                    >
                      View as
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setResetUser(u);
                      setResetPassword(generatePassword());
                      setResetShown(false);
                      setError(null);
                    }}
                  >
                    Reset password
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => void toggleActive(u.id, inactive)}
                  >
                    {inactive ? "Reactivate" : "Deactivate"}
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {userMemberships.map((m) => (
                  <span
                    key={m.id}
                    className="badge badge-ghost gap-1.5"
                    style={{
                      color: spaceColor(m.space_id),
                      backgroundColor: `${spaceColor(m.space_id)}18`,
                    }}
                  >
                    {spaceName(m.space_id)} ·
                    <select
                      value={m.role}
                      onChange={(e) =>
                        void changeRole(
                          u.id,
                          m.space_id,
                          e.target.value as SpaceRole,
                        )
                      }
                      className="bg-transparent text-xs outline-none"
                      style={{ color: spaceColor(m.space_id) }}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="downloader">Downloader</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => void removeMembership(u.id, m.space_id)}
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen ? (
        <AdminModal
          title="New person"
          size="lg"
          onClose={() => setModalOpen(false)}
          footer={
            createdCreds ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setModalOpen(false);
                  setCreatedCreds(null);
                }}
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="create-user-form"
                  disabled={busy}
                  className="btn btn-primary"
                >
                  {busy ? "Creating…" : "Create person"}
                </button>
              </>
            )
          }
        >
          {createdCreds ? (
            <div className="flex flex-col gap-2 py-2">
              <p className="type-body">
                Copy these credentials now — they won’t be shown again.
              </p>
              <p className="type-label">{createdCreds.email}</p>
              <p className="type-label tracking-wide">
                {createdCreds.password}
              </p>
            </div>
          ) : (
            <form
              id="create-user-form"
              onSubmit={(e) => void createUser(e)}
              className="flex flex-col gap-5"
            >
              <fieldset className="fieldset w-full">
              <legend className="fieldset-legend text-xs text-[var(--ink-soft)] py-0">
                  Full name
                </legend>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input input-bordered w-full"
                  autoFocus
                />
              </fieldset>
              <fieldset className="fieldset w-full">
              <legend className="fieldset-legend text-xs text-[var(--ink-soft)] py-0">
                  Email
                </legend>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input input-bordered w-full"
                />
              </fieldset>
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="type-caption text-[var(--ink-soft)]">Password</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => setPassword(generatePassword())}
                  >
                    Generate
                  </button>
                </div>
                <PasswordField
                  value={password}
                  onChange={setPassword}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              <div className="flex flex-col gap-2">
                <p className="type-caption text-[var(--ink-soft)]">Space access</p>
                {rows.map((row) => (
                  <div
                    key={row.key}
                    className="grid grid-cols-[auto_minmax(0,1fr)_7rem_auto] items-center gap-2"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: spaceColor(row.space_id) }}
                    />
                    <select
                      value={row.space_id}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key
                              ? { ...r, space_id: e.target.value }
                              : r,
                          ),
                        )
                      }
                      className="glass-input type-body px-2 py-1.5 rounded-xl bg-white/30 w-full"
                    >
                      {spaces.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={row.role}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) =>
                            r.key === row.key
                              ? { ...r, role: e.target.value as SpaceRole }
                              : r,
                          ),
                        )
                      }
                      className="glass-input type-body px-2 py-1.5 rounded-xl bg-white/30 w-full"
                    >
                      <option value="viewer">Viewer</option>
                      <option value="downloader">Downloader</option>
                      <option value="editor">Editor</option>
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setRows((prev) => prev.filter((r) => r.key !== row.key))
                      }
                      className="btn btn-ghost btn-xs btn-circle"
                      aria-label="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {spaces.length > 0 ? (
                  <button
                    type="button"
                    onClick={addRow}
                    className="btn btn-ghost btn-sm self-start"
                  >
                    + Add another
                  </button>
                ) : null}
              </div>
              {error ? <p className="type-caption text-[#ff3b30]">{error}</p> : null}
            </form>
          )}
        </AdminModal>
      ) : null}

      {resetUser ? (
        <AdminModal
          title="Reset password"
          onClose={() => setResetUser(null)}
          footer={
            resetShown ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setResetUser(null)}
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setResetUser(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="reset-pw-form"
                  disabled={busy}
                  className="btn btn-primary"
                >
                  {busy ? "Saving…" : "Reset"}
                </button>
              </>
            )
          }
        >
          {resetShown ? (
            <div className="flex flex-col gap-2 py-2">
              <p className="type-body">New password for {resetUser.email}:</p>
              <p className="type-label tracking-wide">
                {resetPassword}
              </p>
            </div>
          ) : (
            <form
              id="reset-pw-form"
              onSubmit={(e) => void submitReset(e)}
              className="flex flex-col gap-4"
            >
              <p className="type-body text-[var(--ink-soft)]">
                Set a new password for {resetUser.full_name || resetUser.email}.
              </p>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="type-caption text-[var(--ink-soft)]">Password</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => setResetPassword(generatePassword())}
                  >
                    Generate
                  </button>
                </div>
                <PasswordField
                  value={resetPassword}
                  onChange={setResetPassword}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
              {error ? <p className="type-caption text-[#ff3b30]">{error}</p> : null}
            </form>
          )}
        </AdminModal>
      ) : null}
    </div>
  );
}
