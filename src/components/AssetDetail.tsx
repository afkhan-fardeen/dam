"use client";

import { useEffect, useState } from "react";
import {
  IconStar,
  IconStarFilled,
  IconX,
  IconDownload,
  IconPencil,
  IconFolderSymlink,
  IconTrash,
  IconInfoCircle,
} from "@tabler/icons-react";
import { getTagChipStyles } from "@/lib/categories";
import {
  detectDocPreviewKind,
  parseCsvPreview,
  parseDocxPreview,
  parseXlsxPreview,
  type PreviewTable,
} from "@/lib/docPreview";
import type { Asset, Entity, Folder, Tag } from "@/lib/types";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useDriveChrome } from "@/components/DriveChrome";
import { queueAssetDownload } from "@/lib/download";
import { EntityChip } from "@/components/EntityChip";
import { EntityPicker, type PickedEntity } from "@/components/EntityPicker";
import { AttributeEditor } from "@/components/AttributeEditor";

type AssetDetailProps = {
  asset: Asset;
  folders?: Folder[];
  canDownload: boolean;
  canDelete: boolean;
  canMove?: boolean;
  canRename?: boolean;
  canEditDetails?: boolean;
  trashMode?: boolean;
  canRestore?: boolean;
  initialPanelOpen?: boolean;
  initialShowMove?: boolean;
  onClose: () => void;
  onDeleted: () => void;
  onRestored?: () => void;
  onMoved?: () => void;
  onRenamed?: (asset: Asset) => void;
  onUpdated?: (asset: Asset) => void;
  onFavoriteChange?: (favorited: boolean) => void;
};

export function AssetDetail({
  asset,
  folders = [],
  canDownload,
  canDelete,
  canMove = false,
  canRename = false,
  canEditDetails = false,
  trashMode = false,
  canRestore = false,
  initialPanelOpen = false,
  initialShowMove = false,
  onClose,
  onDeleted,
  onRestored,
  onMoved,
  onRenamed,
  onUpdated,
  onFavoriteChange,
}: AssetDetailProps) {
  const { upsertJob, removeJob } = useDriveChrome();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(initialPanelOpen);
  const [showMove, setShowMove] = useState(initialShowMove);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState(asset.original_name || "");
  const [favorited, setFavorited] = useState(Boolean(asset.favorited));
  const [moveFolderId, setMoveFolderId] = useState<string | null>(asset.folder_id);
  const [editDescription, setEditDescription] = useState(asset.description || "");
  const [editCredit, setEditCredit] = useState(asset.created_by || "");
  const [editTags, setEditTags] = useState<Tag[]>(asset.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [removedTagIds, setRemovedTagIds] = useState<string[]>([]);
  const [addedTagNames, setAddedTagNames] = useState<string[]>([]);
  const [linkedEntities, setLinkedEntities] = useState<
    (Entity & { relation_label?: string | null })[]
  >([]);
  const [entityPickerOpen, setEntityPickerOpen] = useState(false);

  const [docTable, setDocTable] = useState<PreviewTable | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  const docKind = detectDocPreviewKind(asset.mime_type, asset.original_name);
  const mime = asset.mime_type || "";
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const isPdf =
    mime === "application/pdf" ||
    asset.original_name?.toLowerCase().endsWith(".pdf");

  const assetUrl = canDownload
    ? `/api/media/asset/${encodeURIComponent(asset.file_id)}`
    : null;
  const thumbUrl = asset.has_thumbnail
    ? `/api/media/thumbnail/${encodeURIComponent(asset.file_id)}`
    : null;

  const isDirty =
    canEditDetails &&
    (editDescription !== (asset.description || "") ||
      editCredit !== (asset.created_by || "") ||
      addedTagNames.length > 0 ||
      removedTagIds.length > 0);

  useEffect(() => {
    setError(null);
    setShowMove(false);
    setShowRename(false);
    setMoveFolderId(asset.folder_id);
    setRenameValue(asset.original_name || "");
    setFavorited(Boolean(asset.favorited));
    setEditDescription(asset.description || "");
    setEditCredit(asset.created_by || "");
    setEditTags(asset.tags ?? []);
    setTagDraft("");
    setRemovedTagIds([]);
    setAddedTagNames([]);
    setLinkedEntities([]);
    setEntityPickerOpen(false);
    setDocTable(null);
    setDocHtml(null);
    setDocError(null);
  }, [
    asset.file_id,
    asset.folder_id,
    asset.original_name,
    asset.favorited,
    asset.description,
    asset.created_by,
    asset.tags,
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/assets/${asset.id}/entities`);
        const json = await res.json();
        if (!cancelled && res.ok) {
          setLinkedEntities(
            (json.entities ?? []) as (Entity & {
              relation_label?: string | null;
            })[],
          );
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  useEffect(() => {
    if (trashMode || !assetUrl || !docKind || docKind === "doc") return;

    let cancelled = false;
    setDocLoading(true);
    setDocError(null);
    setDocTable(null);
    setDocHtml(null);

    void (async () => {
      try {
        const res = await fetch(assetUrl);
        if (!res.ok) throw new Error("Could not load file for preview");
        if (docKind === "csv") {
          const text = await res.text();
          const table = await parseCsvPreview(text);
          if (!cancelled) setDocTable(table);
        } else if (docKind === "xlsx") {
          const buffer = await res.arrayBuffer();
          const table = await parseXlsxPreview(buffer);
          if (!cancelled) setDocTable(table);
        } else if (docKind === "docx") {
          const buffer = await res.arrayBuffer();
          const html = await parseDocxPreview(buffer);
          if (!cancelled) setDocHtml(html);
        }
      } catch (err) {
        if (!cancelled) {
          setDocError(
            err instanceof Error ? err.message : "Could not preview this file",
          );
        }
      } finally {
        if (!cancelled) setDocLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [assetUrl, docKind, trashMode, asset.file_id]);

  async function handleDelete() {
    setConfirmDelete(true);
  }

  async function confirmHandleDelete() {
    const permanent = trashMode;
    setBusy(true);
    setError(null);
    try {
      const url = permanent
        ? `/api/assets/${asset.id}?permanent=1`
        : `/api/assets/${asset.id}`;
      const res = await fetch(url, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not remove this file.");
      setConfirmDelete(false);
      onDeleted();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not remove this file.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${asset.id}/restore`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not restore this file.");
      onRestored?.();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not restore this file.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleMove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: moveFolderId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not move this file.");
      onMoved?.();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not move this file.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleRename() {
    const name = renameValue.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original_name: name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not rename this file.");
      const updated = json.asset as Asset;
      onRenamed?.(updated);
      onUpdated?.(updated);
      setShowRename(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not rename this file.",
      );
    } finally {
      setBusy(false);
    }
  }

  function addTagFromDraft() {
    const name = tagDraft.trim();
    if (!name) return;
    const exists = editTags.some(
      (t) => t.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      setTagDraft("");
      return;
    }
    setEditTags((prev) => [
      ...prev,
      { id: `new:${name}`, name, created_at: null },
    ]);
    setAddedTagNames((prev) =>
      prev.some((n) => n.toLowerCase() === name.toLowerCase())
        ? prev
        : [...prev, name],
    );
    setTagDraft("");
  }

  function removeEditTag(tag: Tag) {
    setEditTags((prev) => prev.filter((t) => t.id !== tag.id));
    if (tag.id.startsWith("new:")) {
      const name = tag.name;
      setAddedTagNames((prev) =>
        prev.filter((n) => n.toLowerCase() !== name.toLowerCase()),
      );
    } else {
      setRemovedTagIds((prev) =>
        prev.includes(tag.id) ? prev : [...prev, tag.id],
      );
      setAddedTagNames((prev) =>
        prev.filter((n) => n.toLowerCase() !== tag.name.toLowerCase()),
      );
    }
  }

  async function unlinkEntity(entityId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/assets/${asset.id}/entities/${entityId}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not unlink");
      setLinkedEntities((prev) => prev.filter((e) => e.id !== entityId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlink");
    } finally {
      setBusy(false);
    }
  }

  async function onEntitiesPicked(next: PickedEntity[]) {
    const existingIds = new Set(linkedEntities.map((e) => e.id));
    const toAdd = next.filter((e) => !existingIds.has(e.id));
    setEntityPickerOpen(false);
    if (toAdd.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const ent of toAdd) {
        const res = await fetch(`/api/assets/${asset.id}/entities`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity_id: ent.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not link");
        if (json.entities) {
          setLinkedEntities(
            json.entities as (Entity & { relation_label?: string | null })[],
          );
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDetails() {
    // Commit any tag still sitting in the input (Enter not pressed)
    let nextAdded = addedTagNames;
    let nextEditTags = editTags;
    const draft = tagDraft.trim();
    if (draft) {
      const exists = editTags.some(
        (t) => t.name.toLowerCase() === draft.toLowerCase(),
      );
      if (!exists) {
        nextEditTags = [
          ...editTags,
          { id: `new:${draft}`, name: draft, created_at: null },
        ];
        nextAdded = addedTagNames.some(
          (n) => n.toLowerCase() === draft.toLowerCase(),
        )
          ? addedTagNames
          : [...addedTagNames, draft];
        setEditTags(nextEditTags);
        setAddedTagNames(nextAdded);
      }
      setTagDraft("");
    }

    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        description: editDescription,
        created_by: editCredit,
      };
      if (nextAdded.length > 0) body.addTags = nextAdded;
      if (removedTagIds.length > 0) body.removeTagIds = removedTagIds;

      const res = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save details.");
      const updated = { ...(json.asset as Asset), favorited };
      setAddedTagNames([]);
      setRemovedTagIds([]);
      if (updated.tags) setEditTags(updated.tags);
      onUpdated?.(updated);
      onRenamed?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save details.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite() {
    setBusy(true);
    setError(null);
    try {
      if (favorited) {
        const res = await fetch(
          `/api/favorites?asset_id=${encodeURIComponent(asset.id)}`,
          { method: "DELETE" },
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not unstar");
        setFavorited(false);
        onFavoriteChange?.(false);
      } else {
        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asset_id: asset.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not star");
        setFavorited(true);
        onFavoriteChange?.(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update star");
    } finally {
      setBusy(false);
    }
  }

  function renderTable(table: PreviewTable) {
    return (
      <div className="h-full w-full overflow-auto bg-base-100 p-3 text-left">
        <table className="min-w-full type-caption border-collapse">
          <thead>
            <tr>
              {table.headers.map((h) => (
                <th
                  key={h}
                  className="sticky top-0 bg-base-200 px-2 py-1.5 text-left type-label text-base-content border-b border-base-300"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri} className="odd:bg-base-100 even:bg-base-200">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-2 py-1 text-base-content border-b border-base-300/40 whitespace-pre-wrap max-w-[14rem]"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {table.capped ? (
          <p className="mt-2 type-caption opacity-60">
            Showing the first {table.rows.length} rows of {table.totalRows} —
            download for the full file.
          </p>
        ) : null}
      </div>
    );
  }

  function renderPreview() {
    if (trashMode) {
      return (
        <div className="flex flex-col items-center gap-3 px-4 text-center">
          <IconTrash size={40} className="opacity-40" />
          <p className="text-sm opacity-60">This file is in the trash</p>
        </div>
      );
    }
    if (!assetUrl && !thumbUrl) {
      return (
        <p className="type-body text-neutral-content/50">
          Preview not available
        </p>
      );
    }
    if (isVideo && assetUrl) {
      return (
        <video
          controls
          className="max-h-full max-w-full object-contain"
          src={assetUrl}
          poster={thumbUrl || undefined}
          onError={() => setError("Could not load the video preview.")}
        />
      );
    }
    if (isPdf && assetUrl) {
      return (
        <iframe
          title={asset.original_name || "PDF"}
          src={assetUrl}
          className="h-full w-full bg-base-100"
        />
      );
    }
    if (isImage && (assetUrl || thumbUrl)) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={assetUrl || thumbUrl || ""}
          alt=""
          className="max-h-full max-w-full object-contain"
          onError={() => setError("Could not load the preview for this file.")}
        />
      );
    }

    if (docKind === "doc") {
      return (
        <p className="type-body text-neutral-content/60 px-4 text-center">
          Legacy .doc files can&apos;t be previewed — download to open.
        </p>
      );
    }

    if (docKind && assetUrl) {
      if (docLoading) {
        return (
          <p className="type-body text-neutral-content/60">Loading preview…</p>
        );
      }
      if (docError) {
        return (
          <div className="flex flex-col items-center gap-2 px-4 text-center">
            <p className="type-body text-neutral-content/60">{docError}</p>
            <button
              type="button"
              className="type-body underline text-neutral-content/70"
              onClick={() => {
                void queueAssetDownload(
                  asset.file_id,
                  asset.original_name || "download",
                  { upsertJob, removeJob },
                );
              }}
            >
              Download instead
            </button>
          </div>
        );
      }
      if (docTable) return renderTable(docTable);
      if (docHtml) {
        return (
          <div
            className="h-full w-full overflow-auto bg-base-100 p-4 text-left type-body prose-doc"
            // mammoth output is sanitized HTML from our own file bytes
            dangerouslySetInnerHTML={{ __html: docHtml }}
          />
        );
      }
    }

    if (thumbUrl) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl}
          alt=""
          className="max-h-full max-w-full object-contain"
        />
      );
    }

    return (
      <div className="flex flex-col items-center gap-3 px-4 text-center">
        <p className="type-body text-neutral-content/60">
          No in-browser preview — use download.
        </p>
        {canDownload && assetUrl && (
          <button
            type="button"
            className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
            onClick={() => {
              void queueAssetDownload(
                asset.file_id,
                asset.original_name || "download",
                { upsertJob, removeJob },
              );
            }}
          >
            <IconDownload size={14} />
            Download
          </button>
        )}
      </div>
    );
  }

  return (
    <>
    <dialog
      className="modal modal-open"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-box w-11/12 max-w-6xl h-[min(90vh,880px)] p-0 flex flex-col overflow-hidden rounded-none">
        <div className="shrink-0 px-4 py-2.5 flex items-center gap-3 border-b border-base-300">
          <div className="flex-1 min-w-0">
            {showRename ? (
              <input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleRename();
                  if (e.key === "Escape") {
                    setShowRename(false);
                    setRenameValue(asset.original_name || "");
                  }
                }}
                className="input input-bordered input-sm w-full type-title"
                autoFocus
              />
            ) : (
              <h2 className="type-title truncate">
                {asset.original_name || "Untitled file"}
              </h2>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!trashMode && (
              <button
                type="button"
                onClick={() => void toggleFavorite()}
                disabled={busy}
                aria-label={favorited ? "Unstar" : "Star"}
                className="btn btn-ghost btn-sm btn-circle"
              >
                {favorited ? (
                  <IconStarFilled size={18} className="text-warning" />
                ) : (
                  <IconStar size={18} />
                )}
              </button>
            )}
            {canDownload && assetUrl && !trashMode && (
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1.5"
                onClick={() => {
                  void queueAssetDownload(
                    asset.file_id,
                    asset.original_name || "download",
                    { upsertJob, removeJob },
                  );
                }}
              >
                <IconDownload size={14} />
                Download
              </button>
            )}
            <button
              type="button"
              onClick={() => setSidePanelOpen((v) => !v)}
              aria-label={sidePanelOpen ? "Hide info" : "Show info"}
              aria-pressed={sidePanelOpen}
              className="btn btn-ghost btn-sm btn-circle"
            >
              <IconInfoCircle size={18} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="btn btn-ghost btn-sm btn-circle"
            >
              <IconX size={16} />
            </button>
          </div>
        </div>

        <div className="relative flex flex-1 overflow-hidden min-h-0">
          <div className="flex-1 flex items-center justify-center overflow-hidden bg-neutral text-neutral-content min-w-0 relative p-3">
            <div className="h-full w-full flex items-center justify-center min-h-0 overflow-hidden">
              {renderPreview()}
            </div>
            {error && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                <p className="bg-base-100 border border-base-300 shadow text-xs text-error px-3 py-1.5 rounded-box">
                  {error}
                </p>
              </div>
            )}
          </div>

          {sidePanelOpen ? (
            <div className="absolute inset-0 z-10 sm:static sm:inset-auto sm:w-80 sm:shrink-0 bg-base-100 border-l border-base-300 flex flex-col overflow-hidden">
              <div className="sm:hidden flex items-center justify-between px-4 pt-3 pb-1 border-b border-base-300">
                <p className="type-label">Details</p>
                <button
                  type="button"
                  aria-label="Close details"
                  className="btn btn-ghost btn-sm btn-circle"
                  onClick={() => setSidePanelOpen(false)}
                >
                  <IconX size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
              {/* Description */}
              <section>
                <p className="type-micro opacity-50 mb-1.5">
                  Description
                </p>
                {canEditDetails ? (
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    placeholder="Add a description…"
                    className="textarea textarea-bordered w-full type-body leading-relaxed resize-none"
                  />
                ) : (
                  <p className="type-body text-base-content leading-relaxed">
                    {asset.description ? (
                      asset.description
                    ) : (
                      <span className="text-base-content/60">No description</span>
                    )}
                  </p>
                )}
              </section>

              {/* Credit */}
              <section>
                <p className="type-micro opacity-50 mb-1.5">
                  Credit
                </p>
                {canEditDetails ? (
                  <input
                    value={editCredit}
                    onChange={(e) => setEditCredit(e.target.value)}
                    placeholder="Creator name"
                    className="input input-bordered input-sm w-full"
                  />
                ) : (
                  <p className="type-body text-base-content">
                    {asset.created_by ? (
                      asset.created_by
                    ) : (
                      <span className="text-base-content/60">—</span>
                    )}
                  </p>
                )}
              </section>

              {/* Relations */}
              <section>
                <p className="type-micro opacity-50 mb-2">Relations</p>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {linkedEntities.length > 0 ? (
                    linkedEntities.map((e) => (
                      <EntityChip
                        key={e.id}
                        entity={e}
                        href={`/e/${e.id}`}
                        readOnly={!canEditDetails}
                        onRemove={
                          canEditDetails
                            ? () => void unlinkEntity(e.id)
                            : undefined
                        }
                      />
                    ))
                  ) : (
                    <span className="type-body opacity-60">No relations</span>
                  )}
                </div>
                {canEditDetails && !trashMode ? (
                  entityPickerOpen ? (
                    <EntityPicker
                      selected={linkedEntities}
                      onChange={(next) => void onEntitiesPicked(next)}
                      disabled={busy}
                    />
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-primary"
                      onClick={() => setEntityPickerOpen(true)}
                    >
                      Add relation
                    </button>
                  )
                ) : null}
              </section>

              {!trashMode ? (
                <AttributeEditor
                  assetId={asset.id}
                  canEdit={canEditDetails}
                />
              ) : null}

              {/* Tags */}
              <section>
                <p className="type-micro opacity-50 mb-2">
                  Tags
                </p>
                {canEditDetails ? (
                  <>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {editTags.map((t) => {
                        const { style } = getTagChipStyles(t.name);
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => removeEditTag(t)}
                            className="badge gap-1 font-medium"
                            style={style}
                          >
                            {t.name}
                            <IconX size={10} />
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        value={tagDraft}
                        onChange={(e) => setTagDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTagFromDraft();
                          }
                        }}
                        placeholder="Add tag…"
                        className="input input-bordered input-sm flex-1"
                      />
                      <button
                        type="button"
                        onClick={addTagFromDraft}
                        className="btn btn-ghost btn-sm text-primary shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(asset.tags ?? []).length > 0 ? (
                      (asset.tags ?? []).map((t) => {
                        const { style } = getTagChipStyles(t.name);
                        return (
                          <span
                            key={t.id}
                            className="badge font-medium"
                            style={style}
                          >
                            {t.name}
                          </span>
                        );
                      })
                    ) : (
                      <span className="type-body opacity-60">
                        No tags
                      </span>
                    )}
                  </div>
                )}
              </section>

              {isDirty && (
                <button
                  type="button"
                  onClick={() => void handleSaveDetails()}
                  disabled={busy}
                  className="btn btn-primary w-full"
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
              )}

              {error && (
                <p className="type-caption text-error">{error}</p>
              )}

              <div className="border-t border-base-300" />

              {/* File actions */}
              <section className="flex flex-col gap-2">
                {canRename && !trashMode && (
                  showRename ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setShowRename(false);
                          setRenameValue(asset.original_name || "");
                        }}
                        className="btn btn-ghost btn-sm"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRename()}
                        disabled={busy}
                        className="btn btn-primary btn-sm flex-1"
                      >
                        {busy ? "Saving…" : "Save name"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setShowRename(true);
                        setShowMove(false);
                      }}
                      disabled={busy}
                      className="btn btn-ghost btn-sm justify-start gap-2"
                    >
                      <IconPencil size={14} />
                      Rename
                    </button>
                  )
                )}

                {canMove && !trashMode && (
                  showMove ? (
                    <div className="flex flex-col gap-2">
                      <select
                        value={moveFolderId ?? ""}
                        onChange={(e) =>
                          setMoveFolderId(e.target.value || null)
                        }
                        className="select select-bordered select-sm w-full"
                      >
                        <option value="">Space root</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.passcode_enabled
                              ? `${f.name} (locked)`
                              : f.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowMove(false)}
                          className="btn btn-ghost btn-sm"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleMove()}
                          disabled={busy}
                          className="btn btn-primary btn-sm flex-1"
                        >
                          {busy ? "Moving…" : "Move here"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMove(true);
                        setShowRename(false);
                      }}
                      disabled={busy}
                      className="btn btn-ghost btn-sm justify-start gap-2"
                    >
                      <IconFolderSymlink size={14} />
                      Move to folder
                    </button>
                  )
                )}

                {canRestore && (
                  <button
                    type="button"
                    onClick={() => void handleRestore()}
                    disabled={busy}
                    className="btn btn-primary btn-sm"
                  >
                    {busy ? "Working…" : "Restore"}
                  </button>
                )}

                {(canDelete || trashMode) && (canDelete || canRestore) && (
                  <button
                    type="button"
                    onClick={() => void handleDelete()}
                    disabled={busy}
                    className={
                      trashMode
                        ? "btn btn-error btn-sm"
                        : "btn btn-ghost btn-sm justify-start gap-2 text-error"
                    }
                  >
                    {!trashMode && <IconTrash size={14} />}
                    {busy
                      ? "Working…"
                      : trashMode
                        ? "Delete forever"
                        : "Move to trash"}
                  </button>
                )}
              </section>

              {!canDownload && !trashMode && (
                <p className="type-caption opacity-60">
                  Downloading requires a higher role.
                </p>
              )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
      {confirmDelete ? (
        <ConfirmModal
          title={trashMode ? "Delete forever" : "Move to trash"}
          message={
            trashMode
              ? "Permanently delete this file? This cannot be undone."
              : "Move this file to trash?"
          }
          confirmLabel={trashMode ? "Delete forever" : "Move to trash"}
          danger
          busy={busy}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => void confirmHandleDelete()}
        />
      ) : null}
    </>
  );
}
