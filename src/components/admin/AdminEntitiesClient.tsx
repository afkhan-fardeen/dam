"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { AdminModal } from "@/components/admin/AdminModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { entityTypeColor } from "@/components/EntityChip";
import type { Entity, EntityType } from "@/lib/types";

type EntityRow = Entity & {
  document_count?: number;
  alias_count?: number;
};

export function AdminEntitiesClient() {
  const [entities, setEntities] = useState<EntityRow[]>([]);
  const [types, setTypes] = useState<EntityType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  const [editTarget, setEditTarget] = useState<EntityRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editAliases, setEditAliases] = useState("");
  const [mergeTarget, setMergeTarget] = useState<EntityRow | null>(null);
  const [mergeIntoId, setMergeIntoId] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<EntityRow | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ status: statusFilter });
    if (q.trim()) params.set("q", q.trim());
    if (typeFilter) params.set("type", typeFilter);
    const [entRes, typeRes] = await Promise.all([
      fetch(`/api/admin/entities?${params}`),
      fetch("/api/entity-types"),
    ]);
    const entJson = await entRes.json();
    const typeJson = await typeRes.json();
    if (entRes.ok) setEntities(entJson.entities as EntityRow[]);
    else setError(entJson.error || "Could not load entities.");
    if (typeRes.ok) setTypes(typeJson.types as EntityType[]);
  }, [q, typeFilter, statusFilter]);

  useEffect(() => {
    const handle = window.setTimeout(() => void load(), 150);
    return () => window.clearTimeout(handle);
  }, [load]);

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    setBusy(true);
    setError(null);
    try {
      const aliases = editAliases
        .split(/[,;\n]/)
        .map((a) => a.trim())
        .filter(Boolean);
      const res = await fetch(`/api/entities/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), aliases }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save.");
      setEditTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  async function saveMerge(e: React.FormEvent) {
    e.preventDefault();
    if (!mergeTarget || !mergeIntoId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/entities/${mergeTarget.id}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_id: mergeIntoId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not merge.");
      setMergeTarget(null);
      setMergeIntoId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not merge.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/entities/${archiveTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not archive.");
      setArchiveTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass p-5 sm:p-6 flex flex-col gap-4">
      <AdminTabs />

      <div className="flex flex-wrap gap-2 px-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search entities…"
          className="glass-input type-body px-2 py-1.5 rounded-xl bg-white/30"
        />
        <select
          className="glass-input type-body px-2 py-1.5 rounded-xl bg-white/30"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          className="glass-input type-body px-2 py-1.5 rounded-xl bg-white/30"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="merged">Merged</option>
          <option value="all">All</option>
        </select>
      </div>

      {error ? <p className="type-body text-[#ff3b30] px-2">{error}</p> : null}

      <div className="flex flex-col gap-0.5">
        {entities.length === 0 ? (
          <p className="px-2 py-6 type-body text-[var(--ink-soft)] max-w-xl">
            No entities yet. People and organizations appear here when editors
            link them during upload or from a file&apos;s Relations panel. Use
            merge later to clean up near-duplicates.
          </p>
        ) : (
          entities.map((e) => (
            <div
              key={e.id}
              className="px-2 py-3 hover:bg-white/45 flex flex-wrap items-center gap-2"
            >
              <span
                className="h-1.5 w-1.5 shrink-0"
                style={{
                  backgroundColor: entityTypeColor(e.entity_type?.name),
                }}
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/e/${e.id}`}
                  className="type-label truncate hover:underline"
                >
                  {e.name}
                </Link>
                <p className="type-caption text-[var(--ink-soft)]">
                  {e.entity_type?.label || "Entity"}
                  {" · "}
                  {e.document_count ?? 0}{" "}
                  {(e.document_count ?? 0) === 1 ? "doc" : "docs"}
                  {" · "}
                  {e.alias_count ?? e.aliases?.length ?? 0} aliases
                  {e.status !== "active" ? ` · ${e.status}` : ""}
                </p>
              </div>
              {e.status === "active" ? (
                <div className="ml-auto flex flex-wrap gap-1">
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setEditTarget(e);
                      setEditName(e.name);
                      setEditAliases((e.aliases ?? []).join(", "));
                      setError(null);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setMergeTarget(e);
                      setMergeIntoId("");
                      setError(null);
                    }}
                  >
                    Merge
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => setArchiveTarget(e)}
                  >
                    Archive
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>

      {editTarget ? (
        <AdminModal
          title="Edit entity"
          onClose={() => setEditTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditTarget(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="edit-entity-form"
                className="btn btn-primary"
                disabled={busy}
              >
                Save
              </button>
            </>
          }
        >
          <form
            id="edit-entity-form"
            onSubmit={saveEdit}
            className="flex flex-col gap-3"
          >
            <fieldset className="fieldset w-full">
              <legend className="fieldset-legend text-xs text-[var(--ink-soft)] py-0">
                Name
              </legend>
              <input
                required
                className="input input-bordered w-full"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </fieldset>
            <fieldset className="fieldset w-full">
              <legend className="fieldset-legend text-xs text-[var(--ink-soft)] py-0">
                Aliases (comma-separated)
              </legend>
              <input
                className="input input-bordered w-full"
                value={editAliases}
                onChange={(e) => setEditAliases(e.target.value)}
              />
            </fieldset>
          </form>
        </AdminModal>
      ) : null}

      {mergeTarget ? (
        <AdminModal
          title={`Merge “${mergeTarget.name}”`}
          onClose={() => setMergeTarget(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setMergeTarget(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="merge-entity-form"
                className="btn btn-primary"
                disabled={busy || !mergeIntoId}
              >
                Merge
              </button>
            </>
          }
        >
          <form
            id="merge-entity-form"
            onSubmit={saveMerge}
            className="flex flex-col gap-3"
          >
            <p className="type-body text-[var(--ink-soft)]">
              Move all document links to another entity, then mark “
              {mergeTarget.name}” as merged. This cannot be undone from the UI.
            </p>
            <fieldset className="fieldset w-full">
              <legend className="fieldset-legend text-xs text-[var(--ink-soft)] py-0">
                Merge into
              </legend>
              <select
                required
                className="select select-bordered w-full"
                value={mergeIntoId}
                onChange={(e) => setMergeIntoId(e.target.value)}
              >
                <option value="">Choose entity…</option>
                {entities
                  .filter(
                    (x) => x.id !== mergeTarget.id && x.status === "active",
                  )
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </fieldset>
          </form>
        </AdminModal>
      ) : null}

      {archiveTarget ? (
        <ConfirmModal
          title="Archive entity?"
          message={`Archive “${archiveTarget.name}”? It will no longer appear in pickers. Existing document links stay until cleaned up.`}
          confirmLabel="Archive"
          danger
          busy={busy}
          onClose={() => setArchiveTarget(null)}
          onConfirm={() => void confirmArchive()}
        />
      ) : null}
    </div>
  );
}
