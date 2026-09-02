"use client";

import { useEffect, useState } from "react";
import type { FsNode, Tag } from "@/lib/types";
import { getTagChipStyles } from "@/lib/categories";
import {
  fileTypeLabel,
  formatBytes,
  formatModified,
} from "@/lib/explorerFormat";
import { FolderGlyph } from "@/components/explorer/FolderGlyph";
import { useDriveChrome } from "@/components/DriveChrome";

type Props = {
  node: FsNode;
  canEditTags?: boolean;
  canEditDescription?: boolean;
};

export function ExplorerDetails({
  node,
  canEditTags = false,
  canEditDescription = false,
}: Props) {
  const { notifyLibraryChange, setSelectedNode, openPreview } = useDriveChrome();
  const [tags, setTags] = useState<Tag[]>(node.tags ?? []);
  const [draft, setDraft] = useState("");
  const [description, setDescription] = useState(node.description ?? "");
  const [descDirty, setDescDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTags(node.tags ?? []);
    setDraft("");
    setDescription(node.description ?? "");
    setDescDirty(false);
    setError(null);
  }, [node.id, node.tags, node.description]);

  const typeLabel = fileTypeLabel(node.node_type, node.mime_type, node.name);
  const thumb =
    node.node_type === "file" && node.has_thumbnail
      ? `/api/fs/media/thumbnail/${node.id}`
      : null;
  const canPreviewFile = node.node_type === "file";

  async function patchNode(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/fs/nodes/${node.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update");
      const updated = json.node as FsNode | undefined;
      if (updated) {
        setSelectedNode({ ...node, ...updated });
        if (updated.tags) setTags(updated.tags);
        if (typeof updated.description === "string" || updated.description === null) {
          setDescription(updated.description ?? "");
          setDescDirty(false);
        }
      }
      notifyLibraryChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveTags(nextNames: string[]) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/fs/nodes/${node.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: nextNames }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update tags");
      const updated = json.node as FsNode | undefined;
      if (updated?.tags) {
        setTags(updated.tags);
        setSelectedNode({ ...node, ...updated, tags: updated.tags });
      } else {
        setTags(nextNames.map((name, i) => ({ id: `local-${i}`, name } as Tag)));
      }
      notifyLibraryChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Tag update failed");
    } finally {
      setBusy(false);
    }
  }

  function addTag() {
    const name = draft.trim();
    if (!name) return;
    const next = Array.from(new Set([...tags.map((t) => t.name), name]));
    setDraft("");
    void saveTags(next);
  }

  function removeTag(name: string) {
    void saveTags(tags.map((t) => t.name).filter((n) => n !== name));
  }

  return (
    <aside className="xp-details" aria-label="Details">
      <div className="flex flex-col items-center gap-3 pb-4 border-b border-[var(--win-border)]">
        {node.node_type === "file" ? (
          <button
            type="button"
            className="xp-tile-icon xp-details-preview"
            title={canPreviewFile ? "Open preview" : "Open file"}
            onClick={() => openPreview(node)}
          >
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumb}
                alt=""
                className="h-full w-full object-cover rounded"
                loading="lazy"
              />
            ) : (
              <div className="xp-file-block" style={{ width: 64, height: 74 }} />
            )}
          </button>
        ) : (
          <div className="xp-tile-icon xp-details-preview">
            <FolderGlyph size={72} />
          </div>
        )}
        <div className="text-center px-1">
          <div className="text-[13px] font-semibold break-all">{node.name}</div>
          <div className="text-[11px] text-[var(--ink-soft)] mt-0.5">
            {typeLabel}
          </div>
          {node.node_type === "file" ? (
            <button
              type="button"
              className="xp-cmd mt-2"
              onClick={() => openPreview(node)}
            >
              Open preview
            </button>
          ) : null}
        </div>
      </div>

      <dl className="mt-4 space-y-3 text-[12px]">
        <div>
          <dt className="text-[var(--ink-soft)]">Type</dt>
          <dd className="mt-0.5">{typeLabel}</dd>
        </div>
        <div>
          <dt className="text-[var(--ink-soft)]">Size</dt>
          <dd className="mt-0.5">
            {formatBytes(node.size_bytes)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ink-soft)]">Date modified</dt>
          <dd className="mt-0.5">
            {formatModified(node.updated_at || node.created_at)}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--ink-soft)]">Location</dt>
          <dd className="mt-0.5 break-all text-[11px]">
            {node.relative_path || "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-5">
        <div className="text-[12px] text-[var(--ink-soft)] mb-2">Description</div>
        {canEditDescription ? (
          <>
            <textarea
              className="xp-details-textarea"
              rows={3}
              value={description}
              disabled={busy}
              placeholder="Add a description…"
              onChange={(e) => {
                setDescription(e.target.value);
                setDescDirty(true);
              }}
            />
            {descDirty ? (
              <button
                type="button"
                className="xp-cmd mt-2"
                disabled={busy}
                onClick={() =>
                  void patchNode({ description: description.trim() || null })
                }
              >
                Save description
              </button>
            ) : null}
          </>
        ) : (
          <p className="text-[12px] text-[var(--ink)] whitespace-pre-wrap">
            {description.trim() || (
              <span className="text-[var(--ink-faint)]">No description</span>
            )}
          </p>
        )}
      </div>

      <div className="mt-5">
        <div className="text-[12px] text-[var(--ink-soft)] mb-2">Tags</div>
        <div className="flex flex-wrap gap-1.5">
          {tags.length === 0 ? (
            <span className="text-[11px] text-[var(--ink-faint)]">No tags</span>
          ) : (
            tags.map((t) => (
              <span
                key={t.id || t.name}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border border-[var(--win-border)]"
                style={getTagChipStyles(t.name).style}
              >
                {t.name}
                {canEditTags ? (
                  <button
                    type="button"
                    className="opacity-60 hover:opacity-100"
                    disabled={busy}
                    aria-label={`Remove ${t.name}`}
                    onClick={() => removeTag(t.name)}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))
          )}
        </div>
        {canEditTags ? (
          <div className="mt-2 flex gap-1">
            <input
              className="xp-search flex-1 min-w-0"
              style={{ width: "auto" }}
              value={draft}
              placeholder="Add tag"
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
            />
            <button
              type="button"
              className="xp-cmd"
              disabled={busy || !draft.trim()}
              onClick={addTag}
            >
              Add
            </button>
          </div>
        ) : null}
        {error ? (
          <p className="mt-2 text-[11px] text-[var(--danger)]">{error}</p>
        ) : null}
      </div>
    </aside>
  );
}
