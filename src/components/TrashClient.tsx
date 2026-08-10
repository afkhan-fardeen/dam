"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconTrash } from "@tabler/icons-react";
import { AssetCard } from "@/components/AssetCard";
import { AssetDetail } from "@/components/AssetDetail";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useDriveChrome } from "@/components/DriveChrome";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  queueAssetRestore,
  queueAssetTrash,
  queueEmptyTrash,
} from "@/lib/trashJobs";
import type { Asset, Folder, Space } from "@/lib/types";

const PAGE_SIZE = 24;

type TrashClientProps = {
  spaces: Space[];
  /** When set, scopes trash to one space */
  spaceId?: string | null;
  spaceName?: string | null;
};

export function TrashClient({
  spaces,
  spaceId = null,
  spaceName = null,
}: TrashClientProps) {
  const {
    upsertJob,
    setTransferPanelOpen,
    notifyLibraryChange,
    libraryEpoch,
  } = useDriveChrome();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmDeleteForever, setConfirmDeleteForever] = useState(false);
  const [detailFolders, setDetailFolders] = useState<Folder[]>([]);

  const spaceById = useMemo(
    () => new Map(spaces.map((s) => [s.id, s])),
    [spaces],
  );

  const loadPage = useCallback(
    async (nextPage: number, opts?: { append?: boolean; quiet?: boolean }) => {
      const append = Boolean(opts?.append);
      if (append) setLoadingMore(true);
      else if (!opts?.quiet) setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          limit: String(PAGE_SIZE),
        });
        if (spaceId) params.set("space_id", spaceId);

        const res = await fetch(`/api/trash?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not load trash.");

        const next = (json.assets as Asset[]) ?? [];
        const nextTotal = Number(json.total) || 0;
        setTotal(nextTotal);
        setPage(nextPage);
        setHasMore(Boolean(json.hasMore));
        setAssets((prev) => (append ? [...prev, ...next] : next));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load trash.");
        if (!append) setAssets([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [spaceId],
  );

  useEffect(() => {
    void loadPage(1);
  }, [loadPage]);

  const libraryEpochSeen = useRef(libraryEpoch);
  useEffect(() => {
    if (libraryEpoch === libraryEpochSeen.current) return;
    libraryEpochSeen.current = libraryEpoch;
    void loadPage(1, { quiet: true });
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, [libraryEpoch, loadPage]);

  useEffect(() => {
    if (!selected?.space_id) {
      setDetailFolders([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/folders?space_id=${encodeURIComponent(selected.space_id!)}`,
        );
        const json = await res.json();
        if (!cancelled && res.ok) {
          setDetailFolders((json.folders as Folder[]) ?? []);
        }
      } catch {
        if (!cancelled) setDetailFolders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.space_id, selected?.id]);

  const allSelected =
    assets.length > 0 && selectedIds.size === assets.length;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  const picked = useMemo(
    () => assets.filter((a) => selectedIds.has(a.id)),
    [assets, selectedIds],
  );

  async function restorePicked(items: Asset[]) {
    if (items.length === 0) return;
    const ids = new Set(items.map((a) => a.id));
    setAssets((list) => list.filter((a) => !ids.has(a.id)));
    setTotal((n) => Math.max(0, n - items.length));
    exitSelection();
    if (selected && ids.has(selected.id)) setSelected(null);

    const restored = await queueAssetRestore(items, {
      upsertJob,
      setTransferPanelOpen,
      notifyLibraryChange,
    });
    if (restored.length < items.length) {
      void loadPage(1, { quiet: true });
    }
  }

  async function deletePickedForever(items: Asset[]) {
    if (items.length === 0) return;
    const ids = new Set(items.map((a) => a.id));
    setAssets((list) => list.filter((a) => !ids.has(a.id)));
    setTotal((n) => Math.max(0, n - items.length));
    exitSelection();
    setConfirmDeleteForever(false);
    if (selected && ids.has(selected.id)) setSelected(null);

    const removed = await queueAssetTrash(items, {
      upsertJob,
      setTransferPanelOpen,
      notifyLibraryChange,
      permanent: true,
    });
    if (removed.length < items.length) {
      void loadPage(1, { quiet: true });
    }
  }

  async function emptyTrash() {
    setConfirmEmpty(false);
    setAssets([]);
    setTotal(0);
    exitSelection();
    setSelected(null);
    try {
      await queueEmptyTrash({
        upsertJob,
        setTransferPanelOpen,
        notifyLibraryChange,
        spaceId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not empty trash.");
      void loadPage(1, { quiet: true });
    }
  }

  const title = spaceName ? `${spaceName} trash` : "Trash";

  return (
    <div className="trash-page">
      <header className="trash-header">
        <div className="trash-header-main">
          <div className="trash-header-title-row">
            <span className="trash-header-icon" aria-hidden>
              <IconTrash size={18} stroke={1.75} />
            </span>
            <h1 className="trash-title">{title}</h1>
            {!loading ? (
              <span className="place-section-count">{total}</span>
            ) : null}
          </div>
          <p className="trash-subtitle">
            Files stay here until you restore them or delete them forever.
            Actions keep running if you leave this page.
          </p>
        </div>
        <div className="trash-header-actions">
          {total > 0 ? (
            <>
              <button
                type="button"
                className={`place-toolbar-ghost${selectionMode ? " is-active" : ""}`}
                onClick={() => {
                  if (selectionMode) exitSelection();
                  else setSelectionMode(true);
                }}
              >
                {selectionMode ? "Cancel" : "Select"}
              </button>
              <button
                type="button"
                className="place-toolbar-ghost trash-empty-btn"
                onClick={() => setConfirmEmpty(true)}
              >
                Empty trash
              </button>
            </>
          ) : null}
        </div>
      </header>

      {selectionMode ? (
        <div className="bulk-bar" role="toolbar" aria-label="Trash selection">
          <div className="bulk-bar-left">
            <button
              type="button"
              className="place-toolbar-ghost"
              onClick={() => {
                if (allSelected) setSelectedIds(new Set());
                else setSelectedIds(new Set(assets.map((a) => a.id)));
              }}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
            <span className="bulk-bar-count">
              {selectedIds.size === 0
                ? "None selected"
                : `${selectedIds.size} selected`}
            </span>
          </div>
          <div className="bulk-bar-right">
            <button
              type="button"
              className="btn-flat !h-8 px-3 text-[12px]"
              disabled={selectedIds.size === 0}
              onClick={() => void restorePicked(picked)}
            >
              Restore
            </button>
            <button
              type="button"
              className="btn-flat-danger !h-8 px-3 text-[12px]"
              disabled={selectedIds.size === 0}
              onClick={() => setConfirmDeleteForever(true)}
            >
              Delete forever
            </button>
            <button
              type="button"
              className="place-toolbar-ghost"
              onClick={exitSelection}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="type-caption text-[var(--danger)]">{error}</p> : null}

      {loading ? (
        <Skeleton rows={4} />
      ) : assets.length === 0 ? (
        <div className="place-empty">
          <p className="place-empty-title">Trash is empty</p>
          <p className="place-empty-copy">
            Deleted files will show up here. You can restore them or clear trash
            in one go.
          </p>
        </div>
      ) : (
        <>
          <div className="trash-grid">
            {assets.map((asset) => {
              const space = asset.space_id
                ? spaceById.get(asset.space_id)
                : null;
              return (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  layout="grid"
                  showSpace={!spaceId}
                  spaceName={space?.name}
                  spaceColor={space?.color}
                  thumbnailUrl={
                    asset.has_thumbnail
                      ? `/api/media/thumbnail/${encodeURIComponent(asset.file_id)}`
                      : null
                  }
                  selected={selectedIds.has(asset.id)}
                  selectionMode={selectionMode}
                  onToggleSelect={() => toggleSelect(asset.id)}
                  onClick={() => setSelected(asset)}
                  canDownload={false}
                  canEdit={false}
                />
              );
            })}
          </div>

          <div className="trash-pager">
            <span className="trash-pager-meta">
              Showing {assets.length} of {total}
            </span>
            {hasMore ? (
              <button
                type="button"
                className="place-toolbar-ghost"
                disabled={loadingMore}
                onClick={() => void loadPage(page + 1, { append: true })}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            ) : null}
          </div>
        </>
      )}

      {selected ? (
        <AssetDetail
          asset={selected}
          assets={assets}
          onNavigateAsset={setSelected}
          folders={detailFolders}
          canDownload={false}
          canDelete
          canMove={false}
          canRename={false}
          canEditDetails={false}
          trashMode
          canRestore
          onClose={() => setSelected(null)}
          onDeleted={() => {
            setSelected(null);
            void loadPage(1, { quiet: true });
          }}
          onRestored={() => {
            setSelected(null);
            void loadPage(1, { quiet: true });
          }}
        />
      ) : null}

      {confirmEmpty ? (
        <ConfirmModal
          title="Empty trash?"
          message={`Permanently delete ${total} file${total === 1 ? "" : "s"}? This cannot be undone. Deletion continues in the background if you leave.`}
          confirmLabel="Empty trash"
          danger
          onClose={() => setConfirmEmpty(false)}
          onConfirm={() => void emptyTrash()}
        />
      ) : null}

      {confirmDeleteForever ? (
        <ConfirmModal
          title="Delete forever?"
          message={`Permanently delete ${picked.length} selected file${picked.length === 1 ? "" : "s"}? This cannot be undone.`}
          confirmLabel="Delete forever"
          danger
          onClose={() => setConfirmDeleteForever(false)}
          onConfirm={() => void deletePickedForever(picked)}
        />
      ) : null}
    </div>
  );
}
