"use client";

import { useCallback, useEffect, useState } from "react";
import type { Space } from "@/lib/types";
import { SPACE_COLOR_PRESETS } from "@/lib/categories";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { AdminModal } from "@/components/admin/AdminModal";
import { PasswordField } from "@/components/PasswordField";
import { ConfirmModal } from "@/components/ConfirmModal";

type SpaceKind = "brand" | "department";

type StorageRow = { space_id: string; bytes: number };

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function AdminSpacesClient() {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [archived, setArchived] = useState<Space[]>([]);
  const [storage, setStorage] = useState<Map<string, number>>(new Map());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Space | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Space | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SpaceKind>("brand");
  const [color, setColor] = useState(SPACE_COLOR_PRESETS[0]);
  const [passcode, setPasscode] = useState("");
  const [requirePasscode, setRequirePasscode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Space | null>(null);

  const load = useCallback(async () => {
    const [spacesRes, archivedRes, storageRes] = await Promise.all([
      fetch("/api/admin/spaces"),
      fetch("/api/admin/spaces?archived=1"),
      fetch("/api/admin/storage"),
    ]);
    const spacesJson = await spacesRes.json();
    const archivedJson = await archivedRes.json();
    const storageJson = await storageRes.json();
    if (spacesRes.ok) {
      setSpaces(
        ((spacesJson.spaces as Space[]) ?? []).filter(
          (s) => (s as Space & { status?: string }).status !== "archived",
        ),
      );
    }
    if (archivedRes.ok) {
      setArchived(
        ((archivedJson.spaces as Space[]) ?? []).filter(
          (s) => (s as Space & { status?: string }).status === "archived",
        ),
      );
    }
    if (storageRes.ok) {
      const map = new Map<string, number>();
      for (const row of (storageJson.usage as StorageRow[]) ?? []) {
        map.set(row.space_id, row.bytes);
      }
      setStorage(map);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setKind("brand");
    setColor(SPACE_COLOR_PRESETS[0]);
    setPasscode("");
    setRequirePasscode(false);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(s: Space) {
    setEditing(s);
    setName(s.name);
    setKind(s.kind === "department" ? "department" : "brand");
    setColor(s.color || SPACE_COLOR_PRESETS[0]);
    setPasscode("");
    setRequirePasscode(!!s.requires_passcode);
    setError(null);
    setModalOpen(true);
  }

  async function saveSpace(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    if (editing) {
      const body: Record<string, unknown> = { name, color, kind };
      if (!requirePasscode) {
        if (editing.requires_passcode) body.clear_passcode = true;
      } else if (passcode.trim()) {
        body.passcode = passcode.trim();
      }

      const res = await fetch(`/api/admin/spaces/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      setBusy(false);
      if (!res.ok) {
        setError(json.error || "Could not update space.");
        return;
      }
    } else {
      const res = await fetch("/api/admin/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          color,
          kind,
          passcode:
            requirePasscode && passcode.trim() ? passcode.trim() : null,
        }),
      });
      const json = await res.json();
      setBusy(false);
      if (!res.ok) {
        setError(json.error || "Could not create space.");
        return;
      }
    }
    setModalOpen(false);
    await load();
  }

  async function archiveSpace(s: Space) {
    setArchiveTarget(s);
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setBusy(true);
    await fetch(`/api/admin/spaces/${archiveTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    setBusy(false);
    setArchiveTarget(null);
    await load();
  }

  async function restoreSpace(s: Space) {
    await fetch(`/api/admin/spaces/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "active" }),
    });
    await load();
  }

  async function permanentDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!deleteTarget) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/admin/spaces/${deleteTarget.id}?confirm_name=${encodeURIComponent(confirmName)}`,
      { method: "DELETE" },
    );
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Could not delete.");
      return;
    }
    setDeleteTarget(null);
    setConfirmName("");
    await load();
  }

  function SpaceRow({
    s,
    isArchived,
  }: {
    s: Space;
    isArchived?: boolean;
  }) {
    return (
      <div className="flex items-center gap-3 px-2 py-3 rounded-[12px] hover:bg-white/45">
        <span
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: s.color }}
        />
        <div className="min-w-0 flex-1">
          <p className="type-label">{s.name}</p>
          <p className="type-caption text-[var(--ink-soft)]">
            {s.kind === "department" ? "Department" : "Brand"} · {s.slug}
            {s.requires_passcode ? " · Passcode" : ""}
            {" · "}
            {formatBytes(storage.get(s.id) || 0)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isArchived ? (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => openEdit(s)}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => void archiveSpace(s)}
              >
                Archive
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => void restoreSpace(s)}
              >
                Restore
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs text-[#ff3b30]"
                onClick={() => {
                  setDeleteTarget(s);
                  setConfirmName("");
                  setError(null);
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="glass p-5 sm:p-6 flex flex-col gap-4">
      <AdminTabs />

      <div className="flex items-center justify-between gap-3">
        <p className="type-body text-[var(--ink-soft)]">
          {spaces.length} active
        </p>
        <button type="button" onClick={openCreate} className="btn-glass-primary px-4 py-2 text-[13px] font-medium">
          New space
        </button>
      </div>

      <div className="flex flex-col gap-0.5">
        {spaces.map((s) => (
          <SpaceRow key={s.id} s={s} />
        ))}
        {spaces.length === 0 ? (
          <p className="type-body text-[var(--ink-soft)] py-6">No spaces yet.</p>
        ) : null}
      </div>

      {archived.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="type-micro opacity-50">
            Archived
          </h2>
          <div className="flex flex-col gap-0.5 opacity-70">
            {archived.map((s) => (
              <SpaceRow key={s.id} s={s} isArchived />
            ))}
          </div>
        </section>
      ) : null}

      {modalOpen ? (
        <AdminModal
          title={editing ? "Edit space" : "New space"}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="space-form"
                disabled={busy}
                className="btn btn-primary"
              >
                {busy ? "Saving…" : editing ? "Save" : "Create space"}
              </button>
            </>
          }
        >
          <form
            id="space-form"
            onSubmit={(e) => void saveSpace(e)}
            className="flex flex-col gap-5"
          >
            <fieldset className="fieldset w-full">
              <legend className="fieldset-legend text-xs text-[var(--ink-soft)] py-0">
                Name
              </legend>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
                className="input input-bordered w-full"
              />
            </fieldset>

            <div className="flex flex-col gap-2">
              <p className="type-caption text-[var(--ink-soft)]">Type</p>
              <div className="flex rounded-[12px] bg-base-200 p-0.5">
                {(
                  [
                    { key: "brand", label: "Brand" },
                    { key: "department", label: "Department" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setKind(opt.key)}
                    className={`flex-1 rounded-md px-3 py-1.5 type-body ${
                      kind === opt.key
                        ? "bg-base-100 font-semibold text-base-content shadow-sm"
                        : "text-base-content/60"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <p className="type-caption text-[var(--ink-soft)]">Accent color</p>
              <div className="flex flex-wrap gap-2">
                {SPACE_COLOR_PRESETS.map((c) => {
                  const selected = color.toLowerCase() === c.toLowerCase();
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`h-8 w-8 rounded-full ${
                        selected ? "ring-2 ring-offset-2 ring-base-content" : ""
                      }`}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                    />
                  );
                })}
              </div>
            </div>

            <label className="flex items-center gap-2 type-body cursor-pointer">
              <input
                type="checkbox"
                className="checkbox checkbox-sm"
                checked={requirePasscode}
                onChange={(e) => {
                  setRequirePasscode(e.target.checked);
                  if (!e.target.checked) setPasscode("");
                }}
              />
              Require passcode
            </label>
            {requirePasscode ? (
              <PasswordField
                label={
                  editing?.requires_passcode
                    ? "Passcode (leave blank to keep)"
                    : "Passcode"
                }
                value={passcode}
                onChange={setPasscode}
                required={!editing?.requires_passcode}
                autoComplete="new-password"
                placeholder={
                  editing?.requires_passcode
                    ? "Leave blank to keep current"
                    : undefined
                }
              />
            ) : null}

            {error ? <p className="type-caption text-[#ff3b30]">{error}</p> : null}
          </form>
        </AdminModal>
      ) : null}

      {deleteTarget ? (
        <AdminModal
          title="Delete forever"
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="delete-space-form"
                disabled={busy || confirmName !== deleteTarget.name}
                className="btn btn-error"
              >
                {busy ? "Deleting…" : "Delete forever"}
              </button>
            </>
          }
        >
          <form
            id="delete-space-form"
            onSubmit={(e) => void permanentDelete(e)}
            className="flex flex-col gap-4"
          >
            <p className="type-body">
              Type <strong>{deleteTarget.name}</strong> to permanently delete
              this space and its files metadata.
            </p>
            <input
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              className="input input-bordered w-full"
              autoFocus
            />
            {error ? <p className="type-caption text-[#ff3b30]">{error}</p> : null}
          </form>
        </AdminModal>
      ) : null}

      {archiveTarget ? (
        <ConfirmModal
          title="Archive space"
          message={`Archive “${archiveTarget.name}”? It will hide from All files.`}
          confirmLabel="Archive"
          busy={busy}
          onClose={() => setArchiveTarget(null)}
          onConfirm={() => void confirmArchive()}
        />
      ) : null}
    </div>
  );
}
