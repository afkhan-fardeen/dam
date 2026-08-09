"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconStar,
  IconStarFilled,
  IconX,
  IconDownload,
  IconPencil,
  IconFolderSymlink,
  IconTrash,
  IconInfoCircle,
  IconShare,
  IconChevronLeft,
  IconChevronRight,
  IconPhoto,
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
import { PreviewSkeleton } from "@/components/ui/Skeleton";
import { ShareLinkModal } from "@/components/ShareLinkModal";
import {
  getCachedEntities,
  prefetchMediaUrls,
  setCachedEntities,
} from "@/lib/previewCache";

type AssetDetailProps = {
  asset: Asset;
  /** Sibling assets for ← → navigation */
  assets?: Asset[];
  onNavigateAsset?: (asset: Asset) => void;
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
  assets = [],
  onNavigateAsset,
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
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preferFullQuality, setPreferFullQuality] = useState(false);
  const [imageSrc, setImageSrc] = useState<string>("");
  const [imageUpgrading, setImageUpgrading] = useState(false);
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
  const [shareOpen, setShareOpen] = useState(false);
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (shareOpen || confirmDelete) return;
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, shareOpen, confirmDelete]);

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

  useEffect(() => {
    try {
      setPreferFullQuality(sessionStorage.getItem("dam-preview-full-quality") === "1");
    } catch {
      /* ignore */
    }
  }, []);

  // Thumb first, then decode original and swap (or force original when preferred).
  useEffect(() => {
    if (!isImage) {
      setImageSrc("");
      setImageUpgrading(false);
      return;
    }
    const full = assetUrl;
    const thumb = thumbUrl;
    const start =
      preferFullQuality && full ? full : thumb || full || "";
    setImageSrc(start);
    setImageUpgrading(Boolean(full && thumb && !preferFullQuality && start === thumb));

    if (!full || preferFullQuality || !thumb || start === full) {
      setImageUpgrading(false);
      return;
    }

    let cancelled = false;
    const img = new window.Image();
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      setImageSrc(full);
      setImageUpgrading(false);
    };
    img.onerror = () => {
      if (!cancelled) setImageUpgrading(false);
    };
    img.src = full;
    return () => {
      cancelled = true;
    };
  }, [asset.id, isImage, assetUrl, thumbUrl, preferFullQuality]);

  function toggleFullQuality() {
    const next = !preferFullQuality;
    setPreferFullQuality(next);
    try {
      sessionStorage.setItem("dam-preview-full-quality", next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (next && assetUrl) {
      setImageSrc(assetUrl);
      setImageUpgrading(false);
    }
  }

  const isDirty =
    canEditDetails &&
    (editDescription !== (asset.description || "") ||
      editCredit !== (asset.created_by || "") ||
      addedTagNames.length > 0 ||
      removedTagIds.length > 0);

  // Soft-sync when flipping next/prev — keep the lightbox mounted.
  useEffect(() => {
    setError(null);
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
    setEntityPickerOpen(false);
    setDocTable(null);
    setDocHtml(null);
    setDocError(null);
    if (initialShowMove) setShowMove(true);
    else setShowMove(false);
    const cached = getCachedEntities(asset.id);
    setLinkedEntities(
      (cached as (Entity & { relation_label?: string | null })[]) ?? [],
    );
  }, [asset.id, asset.file_id, asset.folder_id, asset.original_name, asset.favorited, asset.description, asset.created_by, asset.tags, initialShowMove]);

  // Side-panel data only — don't block the preview stage.
  useEffect(() => {
    if (!sidePanelOpen) return;
    const cached = getCachedEntities(asset.id);
    if (cached) {
      setLinkedEntities(
        cached as (Entity & { relation_label?: string | null })[],
      );
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/assets/${asset.id}/entities`);
        const json = await res.json();
        if (!cancelled && res.ok) {
          const rows = (json.entities ?? []) as (Entity & {
            relation_label?: string | null;
          })[];
          setCachedEntities(asset.id, rows);
          setLinkedEntities(rows);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asset.id, sidePanelOpen]);

  // Prefetch neighbors so next/prev feels instant.
  useEffect(() => {
    if (!onNavigateAsset || assets.length < 2) return;
    const idx = assets.findIndex((a) => a.id === asset.id);
    if (idx < 0) return;
    const neighbors = [assets[idx - 1], assets[idx + 1]].filter(
      Boolean,
    ) as Asset[];
    prefetchMediaUrls(
      neighbors.map((a) =>
        a.has_thumbnail
          ? `/api/media/thumbnail/${encodeURIComponent(a.file_id)}`
          : a.mime_type?.startsWith("image/")
            ? `/api/media/asset/${encodeURIComponent(a.file_id)}`
            : null,
      ),
    );
  }, [asset.id, assets, onNavigateAsset]);

  useEffect(() => {
    if (!onNavigateAsset || assets.length < 2) return;
    function onKey(e: KeyboardEvent) {
      if (showRename || showMove || confirmDelete) return;
      const idx = assets.findIndex((a) => a.id === asset.id);
      if (idx < 0) return;
      if (e.key === "ArrowRight" && idx < assets.length - 1) {
        e.preventDefault();
        onNavigateAsset!(assets[idx + 1]!);
      } else if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        onNavigateAsset!(assets[idx - 1]!);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    asset.id,
    assets,
    onNavigateAsset,
    showRename,
    showMove,
    confirmDelete,
  ]);

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
      <div className="h-full w-full overflow-auto glass-content p-3 text-left text-[var(--ink)]">
        <table className="min-w-full type-caption border-collapse">
          <thead>
            <tr>
              {table.headers.map((h) => (
                <th
                  key={h}
                  className="sticky top-0 bg-white/80 px-2 py-1.5 text-left type-label text-[var(--ink)]"
                  style={{ borderBottom: "1px solid var(--line)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-black/[0.03]">
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-2 py-1 text-[var(--ink)] whitespace-pre-wrap max-w-[14rem]"
                    style={{ borderBottom: "1px solid var(--line)" }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {table.capped ? (
          <p className="mt-2 type-caption">
            Showing the first {table.rows.length} rows of {table.totalRows} —
            download for the full file.
          </p>
        ) : null}
      </div>
    );
  }

  const isMediaStage = Boolean(isImage || isVideo || isPdf);
  const mediaPending =
    isMediaStage && !trashMode && !assetUrl && !thumbUrl && Boolean(asset.file_id);

  function renderPreview() {
    if (trashMode) {
      return (
        <div className="flex flex-col items-center gap-3 px-4 text-center text-white/70">
          <IconTrash size={40} className="opacity-40" />
          <p className="text-sm">This file is in the trash</p>
        </div>
      );
    }
    if (mediaPending) {
      return <PreviewSkeleton />;
    }
    if (!assetUrl && !thumbUrl) {
      return <p className="type-body text-white/50">Preview not available</p>;
    }
    if (isVideo && assetUrl) {
      return (
        <video
          key={asset.file_id}
          controls
          className="max-h-full max-w-full object-contain"
          src={assetUrl}
          poster={thumbUrl || undefined}
          preload="metadata"
          onError={() => setError("Could not load the video preview.")}
        />
      );
    }
    if (isPdf && assetUrl) {
      return (
        <iframe
          key={asset.file_id}
          title={asset.original_name || "PDF"}
          src={assetUrl}
          className="h-full w-full bg-[#1c1c1e]"
        />
      );
    }
    if (isImage && (assetUrl || thumbUrl)) {
      const previewSrc = imageSrc || thumbUrl || assetUrl || "";
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={asset.file_id}
          src={previewSrc}
          alt=""
          decoding="async"
          className="max-h-full max-w-full object-contain"
          onError={(e) => {
            if (
              thumbUrl &&
              assetUrl &&
              e.currentTarget.src.includes("/thumbnail/")
            ) {
              e.currentTarget.src = assetUrl;
              return;
            }
            setError("Could not load the preview for this file.");
          }}
        />
      );
    }

    if (docKind === "doc") {
      return (
        <div className="glass-content p-6 max-w-md text-center">
          <p className="type-body text-[var(--ink-soft)]">
            Legacy .doc files can&apos;t be previewed — download to open.
          </p>
        </div>
      );
    }

    if (docKind && assetUrl) {
      if (docLoading) {
        return (
          <div className="glass-content w-[min(100%,28rem)] h-48 p-4 flex flex-col gap-3">
            <div className="glass-shimmer h-3" style={{ width: "40%" }} />
            <div className="glass-shimmer h-3 w-full" />
            <div className="glass-shimmer h-3 w-full" />
            <div className="glass-shimmer h-3" style={{ width: "55%" }} />
          </div>
        );
      }
      if (docError) {
        return (
          <div className="glass-content p-6 flex flex-col items-center gap-2 max-w-md text-center">
            <p className="type-body text-[var(--ink-soft)]">{docError}</p>
            <button
              type="button"
              className="dock-btn"
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
            className="h-full w-full overflow-auto glass-content p-4 text-left type-body prose-doc"
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
      <div className="flex flex-col items-center gap-3 px-4 text-center text-white/70">
        <p className="type-body">No in-browser preview — use download.</p>
        {canDownload && assetUrl ? (
          <div className="preview-dock">
            <button
              type="button"
              aria-label="Download"
              onClick={() => {
                void queueAssetDownload(
                  asset.file_id,
                  asset.original_name || "download",
                  { upsertJob, removeJob },
                );
              }}
            >
              <IconDownload size={16} />
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  const lightbox = (
    <>
      <div
        className="preview-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={asset.original_name || "File preview"}
      >
        <button
          type="button"
          className="preview-lightbox-scrim"
          aria-label="Close preview"
          onClick={onClose}
        />
        <div className="preview-lightbox-shell">
          <header className="preview-lightbox-bar">
            <div className="preview-lightbox-title min-w-0">
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
                  className="flat-input w-full"
                  autoFocus
                />
              ) : (
                <h2 className="preview-lightbox-name truncate">
                  {asset.original_name || "Untitled file"}
                </h2>
              )}
            </div>

            <div className="preview-lightbox-actions">
              {!trashMode && (
                <button
                  type="button"
                  onClick={() => void toggleFavorite()}
                  disabled={busy}
                  aria-label={favorited ? "Unstar" : "Star"}
                  className={`preview-tool-btn${favorited ? " is-active" : ""}`}
                >
                  {favorited ? (
                    <IconStarFilled size={16} className="text-[#ff9f0a]" />
                  ) : (
                    <IconStar size={16} />
                  )}
                </button>
              )}
              {canDownload && assetUrl && !trashMode && (
                <button
                  type="button"
                  className="preview-tool-btn preview-tool-btn--primary"
                  onClick={() => {
                    void queueAssetDownload(
                      asset.file_id,
                      asset.original_name || "download",
                      { upsertJob, removeJob },
                    );
                  }}
                >
                  <IconDownload size={14} />
                  <span className="preview-tool-label">Download</span>
                </button>
              )}
              {isImage && canDownload && assetUrl && !trashMode ? (
                <button
                  type="button"
                  className={`preview-tool-btn${
                    preferFullQuality ||
                    (imageSrc.includes("/asset/") && !imageUpgrading)
                      ? " is-active"
                      : ""
                  }`}
                  aria-pressed={preferFullQuality}
                  aria-label={
                    preferFullQuality
                      ? "Using original quality"
                      : "Show original quality"
                  }
                  title={
                    preferFullQuality
                      ? "Original quality on"
                      : imageUpgrading
                        ? "Loading original…"
                        : "Original quality"
                  }
                  onClick={toggleFullQuality}
                >
                  <IconPhoto size={16} />
                  <span className="preview-tool-label">
                    {preferFullQuality
                      ? "Original"
                      : imageUpgrading
                        ? "Loading…"
                        : "Original"}
                  </span>
                </button>
              ) : null}
              {!trashMode && canEditDetails ? (
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  aria-label="Share"
                  className="preview-tool-btn"
                >
                  <IconShare size={16} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSidePanelOpen((v) => !v)}
                aria-label={sidePanelOpen ? "Hide info" : "Show info"}
                aria-pressed={sidePanelOpen}
                className={`preview-tool-btn${sidePanelOpen ? " is-active" : ""}`}
              >
                <IconInfoCircle size={16} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="preview-tool-btn"
              >
                <IconX size={16} />
              </button>
            </div>
          </header>

          <div className="preview-lightbox-body">
            <div
              className={`preview-lightbox-stage${
                isMediaStage || trashMode ? " is-media" : ""
              }`}
            >
              <div className="preview-lightbox-stage-inner">
                {renderPreview()}
              </div>
            {isMediaStage && !trashMode ? (
              <div className="preview-lightbox-nav">
                <div className="preview-dock">
                  {onNavigateAsset && assets.length > 1 ? (
                    <>
                      <button
                        type="button"
                        aria-label="Previous"
                        disabled={
                          assets.findIndex((a) => a.id === asset.id) <= 0
                        }
                        onClick={() => {
                          const idx = assets.findIndex((a) => a.id === asset.id);
                          if (idx > 0) onNavigateAsset(assets[idx - 1]!);
                        }}
                      >
                        <IconChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Next"
                        disabled={
                          assets.findIndex((a) => a.id === asset.id) >=
                          assets.length - 1
                        }
                        onClick={() => {
                          const idx = assets.findIndex((a) => a.id === asset.id);
                          if (idx >= 0 && idx < assets.length - 1) {
                            onNavigateAsset(assets[idx + 1]!);
                          }
                        }}
                      >
                        <IconChevronRight size={16} />
                      </button>
                    </>
                  ) : null}
                  {canDownload && assetUrl ? (
                    <button
                      type="button"
                      aria-label="Download"
                      onClick={() => {
                        void queueAssetDownload(
                          asset.file_id,
                          asset.original_name || "download",
                          { upsertJob, removeJob },
                        );
                      }}
                    >
                      <IconDownload size={16} />
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
            {error && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
                <p className="surface type-caption text-[var(--danger)] px-3 py-1.5 flat-shake">
                  {error}
                </p>
              </div>
            )}
          </div>

          {sidePanelOpen ? (
            <aside className="preview-lightbox-meta">
              <div className="preview-lightbox-meta-mobile-head">
                <p className="type-label">Details</p>
                <button
                  type="button"
                  aria-label="Close details"
                  className="preview-tool-btn"
                  onClick={() => setSidePanelOpen(false)}
                >
                  <IconX size={16} />
                </button>
              </div>
              <div className="preview-lightbox-meta-scroll">
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
            </aside>
          ) : null}
          </div>
        </div>
      </div>
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
      {shareOpen ? (
        <ShareLinkModal
          assetId={asset.id}
          assetName={asset.original_name || "Untitled"}
          onClose={() => setShareOpen(false)}
        />
      ) : null}
    </>
  );

  if (!mounted) return null;
  return createPortal(lightbox, document.body);
}
