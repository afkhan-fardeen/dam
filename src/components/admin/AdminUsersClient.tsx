"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Space, SpaceMembership, SpaceRole, Profile } from "@/lib/types";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { AdminModal } from "@/components/admin/AdminModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Button } from "@/components/ui/Button";
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

const ROLE_OPTIONS: { value: SpaceRole; label: string }[] = [
  { value: "viewer", label: "Viewer" },
  { value: "downloader", label: "Downloader" },
  { value: "editor", label: "Editor" },
];

export function AdminUsersClient() {
  const router = useRouter();
  const [users, setUsers] = useState<Profile[]>([]);
  const [memberships, setMemberships] = useState<SpaceMembership[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [resetUser, setResetUser] = useState<Profile | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetShown, setResetShown] = useState(false);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
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
    if (!usersRes.ok) {
      setError(usersJson.error || "Could not load people.");
      return;
    }
    setUsers(usersJson.users as Profile[]);
    setMemberships(usersJson.memberships as SpaceMembership[]);
    setMeId((usersJson.me as string | null) ?? null);
    if (spacesRes.ok) setSpaces(spacesJson.spaces as Space[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // List everyone normally (no greyed-out / inactive styling).
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q),
    );
  }, [users, query]);

  function membershipRowsFor(userId: string): PendingRow[] {
    return memberships
      .filter((m) => m.user_id === userId)
      .map((m) => ({
        key: m.id,
        space_id: m.space_id,
        role: m.role,
      }));
  }

  function openCreate() {
    setEditing(null);
    setEmail("");
    setFullName("");
    setPassword(generatePassword());
    setIsAdmin(false);
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

  function openEdit(user: Profile) {
    setEditing(user);
    setEmail(user.email || "");
    setFullName(user.full_name || "");
    setPassword("");
    setIsAdmin(Boolean(user.is_admin));
    setError(null);
    setCreatedCreds(null);
    setRows(membershipRowsFor(user.id));
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
        email: email.trim().toLowerCase(),
        full_name: fullName,
        password,
        memberships: rows.map(({ space_id, role }) => ({ space_id, role })),
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not create this person.");
      return;
    }
    setCreatedCreds({ email: json.email, password: json.password });
    await load();
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);

    const existing = memberships.filter((m) => m.user_id === editing.id);
    const nextSpaceIds = new Set(rows.map((r) => r.space_id));
    const remove_space_ids = existing
      .filter((m) => !nextSpaceIds.has(m.space_id))
      .map((m) => m.space_id);

    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: editing.id,
        full_name: fullName,
        email: email.trim().toLowerCase(),
        is_admin: isAdmin,
        memberships: rows.map(({ space_id, role }) => ({ space_id, role })),
        remove_space_ids,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not save changes.");
      return;
    }
    setModalOpen(false);
    setEditing(null);
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
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not reset password.");
      return;
    }
    setResetShown(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: deleteTarget.id }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not delete this person.");
      setDeleteTarget(null);
      return;
    }
    if (editing?.id === deleteTarget.id) {
      setModalOpen(false);
      setEditing(null);
    }
    setDeleteTarget(null);
    await load();
  }

  async function viewAs(userId: string) {
    await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId }),
    });
    router.push("/");
  }

  const spaceName = (id: string) => spaces.find((b) => b.id === id)?.name || id;
  const spaceColor = (id: string) =>
    spaces.find((b) => b.id === id)?.color || "#6b7280";

  const isSelf = Boolean(editing && meId && editing.id === meId);

  return (
    <div className="admin-panel">
      <AdminTabs />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          className="admin-input max-w-xs"
        />
        <Button variant="primary" type="button" onClick={openCreate}>
          New person
        </Button>
      </div>

      {error && !modalOpen && !resetUser && !deleteTarget ? (
        <p className="type-caption text-[var(--danger)]">{error}</p>
      ) : null}

      <div className="admin-list">
        {filtered.length === 0 ? (
          <p className="type-caption text-[var(--ink-soft)] px-2 py-4">
            No people yet. Create someone to get started.
          </p>
        ) : null}
        {filtered.map((u) => {
          const userMemberships = memberships.filter((m) => m.user_id === u.id);
          const self = meId === u.id;
          return (
            <div
              key={u.id}
              className="px-2 py-3 hover:bg-[var(--surface-2)] flex flex-col gap-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="type-label">{u.full_name || "Unnamed"}</p>
                <p className="type-caption text-[var(--ink-soft)]">{u.email}</p>
                {u.is_admin ? (
                  <span className="badge badge-neutral badge-sm">Admin</span>
                ) : null}
                {self ? (
                  <span className="badge badge-ghost badge-sm">You</span>
                ) : null}
                <div className="ml-auto flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="admin-ghost-btn"
                    onClick={() => openEdit(u)}
                  >
                    Edit
                  </button>
                  {!u.is_admin ? (
                    <button
                      type="button"
                      className="admin-ghost-btn"
                      onClick={() => void viewAs(u.id)}
                    >
                      View as
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="admin-ghost-btn"
                    onClick={() => {
                      setResetUser(u);
                      setResetPassword(generatePassword());
                      setResetShown(false);
                      setError(null);
                    }}
                  >
                    Reset password
                  </button>
                  {!self ? (
                    <button
                      type="button"
                      className="admin-ghost-btn is-danger"
                      onClick={() => {
                        setError(null);
                        setDeleteTarget(u);
                      }}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {userMemberships.length === 0 ? (
                  <span className="type-caption text-[var(--ink-soft)]">
                    {u.is_admin ? "Full admin access" : "No space access"}
                  </span>
                ) : (
                  userMemberships.map((m) => (
                    <span
                      key={m.id}
                      className="badge badge-ghost gap-1"
                      style={{
                        color: spaceColor(m.space_id),
                        backgroundColor: `${spaceColor(m.space_id)}18`,
                      }}
                    >
                      {spaceName(m.space_id)} ·{" "}
                      {ROLE_OPTIONS.find((r) => r.value === m.role)?.label ||
                        m.role}
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen ? (
        <AdminModal
          title={editing ? "Edit person" : "New person"}
          size="lg"
          onClose={() => {
            if (busy) return;
            setModalOpen(false);
            setEditing(null);
            setCreatedCreds(null);
          }}
          footer={
            createdCreds ? (
              <Button
                variant="primary"
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setCreatedCreds(null);
                }}
              >
                Done
              </Button>
            ) : (
              <>
                {editing && !isSelf ? (
                  <Button
                    variant="destructive"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setError(null);
                      setDeleteTarget(editing);
                    }}
                  >
                    Delete permanently
                  </Button>
                ) : null}
                <div className="flex-1" />
                <Button
                  variant="secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setModalOpen(false);
                    setEditing(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  form={editing ? "edit-user-form" : "create-user-form"}
                  disabled={busy || (!editing && password.length < 8)}
                >
                  {busy
                    ? editing
                      ? "Saving…"
                      : "Creating…"
                    : editing
                      ? "Save changes"
                      : "Create person"}
                </Button>
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
              id={editing ? "edit-user-form" : "create-user-form"}
              onSubmit={(e) => void (editing ? saveEdit(e) : createUser(e))}
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
                  name="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input input-bordered w-full"
                  autoComplete="off"
                />
              </fieldset>

              {!editing ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="type-caption text-[var(--ink-soft)]">
                      Password
                    </span>
                    <button
                      type="button"
                      className="admin-ghost-btn"
                      onClick={() => setPassword(generatePassword())}
                    >
                      Generate
                    </button>
                  </div>
                  <PasswordField
                    name="password"
                    value={password}
                    onChange={setPassword}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-xl bg-white/35 px-3 py-3">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <span className="type-body">Admin</span>
                    <input
                      type="checkbox"
                      className="toggle toggle-sm"
                      checked={isAdmin}
                      disabled={isSelf}
                      onChange={(e) => setIsAdmin(e.target.checked)}
                    />
                  </label>
                  {isSelf ? (
                    <p className="type-caption text-[var(--ink-soft)]">
                      You can’t change your own admin status here.
                    </p>
                  ) : null}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <p className="type-caption text-[var(--ink-soft)]">
                  Space access
                </p>
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
                      className="admin-input w-full"
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
                      className="admin-input w-full"
                    >
                      {ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        setRows((prev) =>
                          prev.filter((r) => r.key !== row.key),
                        )
                      }
                      className="admin-ghost-btn"
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
                    className="admin-ghost-btn"
                  >
                    + Add space
                  </button>
                ) : (
                  <p className="type-caption text-[var(--ink-soft)]">
                    Create a space first, then assign access here.
                  </p>
                )}
              </div>
              {error ? (
                <p className="type-caption text-[var(--danger)]">{error}</p>
              ) : null}
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
              <Button
                variant="primary"
                type="button"
                onClick={() => setResetUser(null)}
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setResetUser(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  form="reset-pw-form"
                  disabled={busy}
                >
                  {busy ? "Saving…" : "Reset"}
                </Button>
              </>
            )
          }
        >
          {resetShown ? (
            <div className="flex flex-col gap-2 py-2">
              <p className="type-body">New password for {resetUser.email}:</p>
              <p className="type-label tracking-wide">{resetPassword}</p>
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
                  <span className="type-caption text-[var(--ink-soft)]">
                    Password
                  </span>
                  <button
                    type="button"
                    className="admin-ghost-btn"
                    onClick={() => setResetPassword(generatePassword())}
                  >
                    Generate
                  </button>
                </div>
                <PasswordField
                  name="password"
                  value={resetPassword}
                  onChange={setResetPassword}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </div>
              {error ? (
                <p className="type-caption text-[var(--danger)]">{error}</p>
              ) : null}
            </form>
          )}
        </AdminModal>
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="Delete permanently?"
          message={`This permanently removes ${
            deleteTarget.full_name || deleteTarget.email || "this person"
          } and their login. Space memberships are cleared. Uploaded files stay. This cannot be undone.`}
          confirmLabel="Delete permanently"
          danger
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onClose={() => {
            if (!busy) setDeleteTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}
