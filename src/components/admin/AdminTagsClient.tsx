"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { AdminModal } from "@/components/admin/AdminModal";
import { ConfirmModal } from "@/components/ConfirmModal";

type TagRow = {
  id: string;
  name: string;
  created_at: string | null;
  count: number;
};

export function AdminTagsClient() {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renameTag, setRenameTag] = useState<TagRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [mergeTag, setMergeTag] = useState<TagRow | null>(null);
  const [mergeIntoId, setMergeIntoId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TagRow | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/tags");
    const json = await res.json();
    if (res.ok) setTags(json.tags as TagRow[]);
    else setError(json.error || "Could not load tags");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renameTag) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: renameTag.id, name: renameValue.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not rename");
      setRenameTag(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename");
    } finally {
      setBusy(false);
    }
  }

  async function saveMerge(e: React.FormEvent) {
    e.preventDefault();
    if (!mergeTag || !mergeIntoId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: mergeTag.id,
          merge_into_id: mergeIntoId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not merge");
      setMergeTag(null);
      setMergeIntoId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not merge");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTag(tag: TagRow) {
    setDeleteTarget(tag);
  }

  async function confirmDeleteTag() {
    if (!deleteTarget) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/tags?id=${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not delete");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass p-5 sm:p-6 flex flex-col gap-4">
      <AdminTabs />
      {error ? (
        <p className="type-body text-[#ff3b30] px-2">{error}</p>
      ) : null}

      <div className="flex flex-col gap-0.5">
        {tags.length === 0 ? (
          <p className="px-2 py-6 type-body text-[var(--ink-soft)]">
            No tags yet. Tags appear when people tag files on upload.
          </p>
        ) : (
          tags.map((t) => (
            <div
              key={t.id}
              className="px-2 py-3 rounded-[12px] hover:bg-white/45 flex flex-wrap items-center gap-2"
            >
              <div className="min-w-0">
                <p className="type-label truncate">
                  {t.name}
                </p>
                <p className="type-caption text-[var(--ink-soft)]">
                  {t.count} {t.count === 1 ? "file" : "files"}
                </p>
              </div>
              <div className="ml-auto flex flex-wrap gap-1">
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setRenameTag(t);
                    setRenameValue(t.name);
                    setError(null);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => {
                    setMergeTag(t);
                    setMergeIntoId("");
                    setError(null);
                  }}
                >
                  Merge
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  disabled={busy}
                  onClick={() => void deleteTag(t)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {renameTag ? (
        <AdminModal
          title="Rename tag"
          onClose={() => setRenameTag(null)}
          size="md"
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setRenameTag(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="rename-tag-form"
                className="btn btn-primary"
                disabled={busy}
              >
                Save
              </button>
            </>
          }
        >
          <form id="rename-tag-form" onSubmit={saveRename} className="flex flex-col gap-3">
            <fieldset className="fieldset w-full">
              <legend className="fieldset-legend text-xs text-[var(--ink-soft)] py-0">
                Name
              </legend>
              <input
                required
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="input input-bordered w-full"
              />
            </fieldset>
          </form>
        </AdminModal>
      ) : null}

      {mergeTag ? (
        <AdminModal
          title={`Merge “${mergeTag.name}”`}
          onClose={() => setMergeTag(null)}
          size="md"
          footer={
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setMergeTag(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="merge-tag-form"
                className="btn btn-primary"
                disabled={busy || !mergeIntoId}
              >
                Merge
              </button>
            </>
          }
        >
          <form id="merge-tag-form" onSubmit={saveMerge} className="flex flex-col gap-3">
            <p className="type-body text-[var(--ink-soft)]">
              Move all file links to another tag, then delete “{mergeTag.name}”.
            </p>
            <fieldset className="fieldset w-full">
              <legend className="fieldset-legend text-xs text-[var(--ink-soft)] py-0">
                Merge into
              </legend>
              <select
                required
                value={mergeIntoId}
                onChange={(e) => setMergeIntoId(e.target.value)}
                className="select select-bordered w-full"
              >
                <option value="">Choose tag…</option>
                {tags
                  .filter((t) => t.id !== mergeTag.id)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </fieldset>
          </form>
        </AdminModal>
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="Delete tag"
          message={`Delete tag “${deleteTarget.name}”? It will be unlinked from all files.`}
          confirmLabel="Delete"
          danger
          busy={busy}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void confirmDeleteTag()}
        />
      ) : null}
    </div>
  );
}
