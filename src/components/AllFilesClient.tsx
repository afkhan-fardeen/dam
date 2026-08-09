"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AssetCard, type AssetMenuAction } from "@/components/AssetCard";
import { AssetDetail } from "@/components/AssetDetail";
import { ConfirmModal } from "@/components/ConfirmModal";
import { MoveAssetModal } from "@/components/MoveAssetModal";
import { ViewModeToggle } from "@/components/ViewModeToggle";
import { GlassSkeleton } from "@/components/glass/GlassSkeleton";
import { canDownload, canEdit, type Asset, type Folder, type Space, type SpaceMembership } from "@/lib/types";
import { roleForSpace } from "@/lib/auth-client";
import { readViewMode, writeViewMode, type ViewMode } from "@/lib/uiPrefs";
import { queueAssetDownload } from "@/lib/download";
import { useDriveChrome } from "@/components/DriveChrome";

type AllFilesClientProps = {
  spaces: Space[];
  memberships: SpaceMembership[];
  isAdmin: boolean;
};

export function AllFilesClient({
  spaces,
  memberships,
  isAdmin,
}: AllFilesClientProps) {
  const searchParams = useSearchParams();
  const view = searchParams.get("view") || "all";
  const { upsertJob, removeJob } = useDriveChrome();

  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [detailLaunch, setDetailLaunch] = useState<{
    panel: boolean;
    move: boolean;
  }>({ panel: false, move: false });
  const [detailFolders, setDetailFolders] = useState<Folder[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [pendingTrash, setPendingTrash] = useState<Asset | null>(null);
  const [renameTarget, setRenameTarget] = useState<Asset | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [moveTarget, setMoveTarget] = useState<Asset | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);

  useEffect(() => {
    setViewMode(readViewMode());
  }, []);

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

  const spaceById = useMemo(
    () => new Map(spaces.map((s) => [s.id, s])),
    [spaces],
  );

  const title =
    view === "recent"
      ? "Recent"
      : view === "trash"
        ? "Trash"
        : view === "favorites" || view === "starred"
          ? "Favorites"
          : "All files";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (view === "trash" || view === "recent") {
        params.set("view", view);
      } else if (view === "favorites" || view === "starred") {
        params.set("view", "starred");
      }
      const res = await fetch(`/api/search?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load files.");
      setAssets(json.assets as Asset[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load files.");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    void load();
  }, [load]);

  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    writeViewMode(mode);
  }

  function roleForAsset(asset: Asset) {
    if (!asset.space_id) return null;
    return roleForSpace(memberships, asset.space_id, isAdmin);
  }

  async function toggleFavorite(asset: Asset) {
    const favorited = Boolean(asset.favorited);
    try {
      if (favorited) {
        await fetch(`/api/favorites?asset_id=${encodeURIComponent(asset.id)}`, {
          method: "DELETE",
        });
      } else {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asset_id: asset.id }),
        });
      }
      setAssets((list) =>
        list.map((a) =>
          a.id === asset.id ? { ...a, favorited: !favorited } : a,
        ),
      );
      setSelected((cur) =>
        cur?.id === asset.id ? { ...cur, favorited: !favorited } : cur,
      );
    } catch {
      /* ignore */
    }
  }

  async function handleMenuAction(asset: Asset, action: AssetMenuAction) {
    if (action === "trash") {
      setPendingTrash(asset);
      return;
    }
    if (action === "rename") {
      setRenameTarget(asset);
      setRenameValue(asset.original_name || "Untitled");
      return;
    }
    if (action === "move") {
      setMoveTarget(asset);
      return;
    }
    setDetailLaunch({ panel: false, move: false });
    setSelected(asset);
  }

  async function confirmMove(folderId: string | null) {
    if (!moveTarget) return;
    setMoveBusy(true);
    try {
      const res = await fetch(`/api/assets/${moveTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not move file.");
      setMoveTarget(null);
      void load();
    } catch (err) {
      throw err instanceof Error ? err : new Error("Could not move file.");
    } finally {
      setMoveBusy(false);
    }
  }

  async function confirmTrash() {
    if (!pendingTrash) return;
    setConfirmBusy(true);
    try {
      const res = await fetch(`/api/assets/${pendingTrash.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setAssets((list) => list.filter((a) => a.id !== pendingTrash.id));
        if (selected?.id === pendingTrash.id) {
          setSelected(null);
          setDetailLaunch({ panel: false, move: false });
        }
      }
      setPendingTrash(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  async function confirmRename(e: React.FormEvent) {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;
    setConfirmBusy(true);
    try {
      const res = await fetch(`/api/assets/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original_name: renameValue.trim() }),
      });
      const json = await res.json();
      if (res.ok && json.asset) {
        const updated = json.asset as Asset;
        setAssets((list) =>
          list.map((a) =>
            a.id === renameTarget.id
              ? { ...updated, favorited: a.favorited }
              : a,
          ),
        );
        setSelected((cur) =>
          cur?.id === renameTarget.id
            ? { ...updated, favorited: cur.favorited }
            : cur,
        );
      }
      setRenameTarget(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 w-full max-w-5xl mx-auto">
      <div className="glass-content p-5 sm:p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="type-page">{title}</h1>
        <div className="flex items-center gap-2">
          {view !== "trash" && assets.length > 0 ? (
            <button
              type="button"
              className={`dock-btn ${showTags ? "dock-btn-active" : ""}`}
              onClick={() => setShowTags((v) => !v)}
            >
              {showTags ? "Hide tags" : "Show tags"}
            </button>
          ) : null}
          {view !== "trash" ? (
            <ViewModeToggle value={viewMode} onChange={changeViewMode} />
          ) : null}
        </div>
      </div>

      {error ? <p className="type-body text-[#ff3b30]">{error}</p> : null}
      {loading ? (
        <GlassSkeleton rows={4} />
      ) : assets.length === 0 ? (
        <p className="type-body text-[var(--ink-soft)]">
          {spaces.length === 0
            ? isAdmin
              ? "Create a space in Admin, then come back here."
              : "Ask an admin to add you to a space."
            : "No files yet."}
        </p>
      ) : (
        <div
          className={
            viewMode === "list"
              ? "flex flex-col gap-0.5"
              : "grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2"
          }
        >
          {viewMode === "list" ? (
            <div className="flex items-center gap-3 px-3 py-1.5 type-micro opacity-50">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="w-8 shrink-0" />
                <span className="flex-1 min-w-0">Name</span>
                <span className="w-28 shrink-0 hidden sm:inline">Space</span>
                <span className="w-16 shrink-0 text-right hidden md:inline">
                  Size
                </span>
                <span className="w-24 shrink-0 text-right hidden lg:inline">
                  Modified
                </span>
              </div>
              <span className="w-[5.5rem] shrink-0" />
            </div>
          ) : null}
          {assets.map((asset) => {
            const space = asset.space_id
              ? spaceById.get(asset.space_id)
              : null;
            const role = roleForAsset(asset);
            const downloadable = canDownload(role, isAdmin);
            const editable = canEdit(role, isAdmin) && view !== "trash";
            return (
              <AssetCard
                key={asset.id}
                asset={asset}
                layout={viewMode === "list" ? "list" : "grid"}
                spaceName={space?.name ?? null}
                spaceColor={space?.color ?? null}
                showSpace
                showTags={showTags}
                thumbnailUrl={
                  asset.has_thumbnail
                    ? `/api/media/thumbnail/${encodeURIComponent(asset.file_id)}`
                    : null
                }
                locked={Boolean(asset.locked)}
                onClick={() => {
                  setDetailLaunch({ panel: false, move: false });
                  setSelected(asset);
                }}
                onToggleFavorite={
                  view !== "trash"
                    ? () => void toggleFavorite(asset)
                    : undefined
                }
                canDownload={downloadable && view !== "trash"}
                canEdit={editable}
                onDownload={
                  downloadable
                    ? () => {
                        void queueAssetDownload(
                          asset.file_id,
                          asset.original_name || "download",
                          { upsertJob, removeJob },
                        );
                      }
                    : undefined
                }
                onMenuAction={
                  editable
                    ? (action) => void handleMenuAction(asset, action)
                    : undefined
                }
              />
            );
          })}
        </div>
      )}
      </div>

      {selected ? (
        <AssetDetail
          key={`${selected.id}-${detailLaunch.move ? "move" : "view"}`}
          asset={selected}
          folders={detailFolders}
          canDownload={
            canDownload(roleForAsset(selected), isAdmin) &&
            !selected.locked &&
            view !== "trash"
          }
          canDelete={
            view === "trash" ||
            isAdmin ||
            canEdit(roleForAsset(selected), isAdmin)
          }
          canMove={
            view !== "trash" && canEdit(roleForAsset(selected), isAdmin)
          }
          canRename={
            view !== "trash" && canEdit(roleForAsset(selected), isAdmin)
          }
          canEditDetails={
            view !== "trash" && canEdit(roleForAsset(selected), isAdmin)
          }
          trashMode={view === "trash"}
          canRestore={view === "trash"}
          initialPanelOpen={detailLaunch.panel}
          initialShowMove={detailLaunch.move}
          onClose={() => {
            setSelected(null);
            setDetailLaunch({ panel: false, move: false });
          }}
          onDeleted={() => {
            setSelected(null);
            setDetailLaunch({ panel: false, move: false });
            void load();
          }}
          onRestored={() => {
            setSelected(null);
            setDetailLaunch({ panel: false, move: false });
            void load();
          }}
          onMoved={() => {
            setSelected(null);
            setDetailLaunch({ panel: false, move: false });
            void load();
          }}
          onUpdated={(updated) => {
            setSelected({ ...updated, favorited: selected.favorited });
            setAssets((list) =>
              list.map((a) =>
                a.id === updated.id
                  ? { ...updated, favorited: a.favorited }
                  : a,
              ),
            );
          }}
          onFavoriteChange={(favorited) => {
            setSelected((cur) => (cur ? { ...cur, favorited } : cur));
            setAssets((list) =>
              list.map((a) =>
                a.id === selected.id ? { ...a, favorited } : a,
              ),
            );
          }}
        />
      ) : null}

      {pendingTrash ? (
        <ConfirmModal
          title="Move to trash"
          message={`Move “${pendingTrash.original_name || "this file"}” to trash?`}
          confirmLabel="Move to trash"
          danger
          busy={confirmBusy}
          onClose={() => setPendingTrash(null)}
          onConfirm={() => void confirmTrash()}
        />
      ) : null}

      {renameTarget ? (
        <dialog
          className="modal modal-open"
          onCancel={(e) => {
            e.preventDefault();
            setRenameTarget(null);
          }}
        >
          <div className="glass-scrim absolute inset-0 pointer-events-none" />
          <form
            onSubmit={confirmRename}
            onClick={(e) => e.stopPropagation()}
            className="modal-box max-w-sm glass-content glass-appear !bg-[var(--content-glass)] border-0 shadow-none"
            style={{ borderRadius: 22 }}
          >
            <h3 className="type-title mb-3">Rename file</h3>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="glass-input w-full type-body px-3 py-2 rounded-[12px] bg-white/55"
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                className="btn-glass"
                onClick={() => setRenameTarget(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-glass-primary"
                disabled={confirmBusy || !renameValue.trim()}
              >
                Save
              </button>
            </div>
          </form>
          <form method="dialog" className="modal-backdrop bg-transparent">
            <button type="button" onClick={() => setRenameTarget(null)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}

      {moveTarget?.space_id ? (
        <MoveAssetModal
          assetName={moveTarget.original_name || "Untitled"}
          spaceId={moveTarget.space_id}
          currentFolderId={moveTarget.folder_id}
          busy={moveBusy}
          onClose={() => setMoveTarget(null)}
          onMove={confirmMove}
        />
      ) : null}
    </div>
  );
}
