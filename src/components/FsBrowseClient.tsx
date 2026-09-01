"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconDots,
  IconDownload,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { FolderGlyph } from "@/components/explorer/FolderGlyph";
import { useDriveChrome } from "@/components/DriveChrome";
import type { FsNode } from "@/lib/types";
import {
  fileTypeLabel,
  formatBytes,
  formatModified,
} from "@/lib/explorerFormat";
import { readViewMode } from "@/lib/uiPrefs";

type Props = {
  isAdmin: boolean;
};

export function FsBrowseClient({ isAdmin }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") || "all";
  const {
    upsertJob,
    removeJob,
    libraryEpoch,
    notifyLibraryChange,
    setExplorer,
    setSelectedNode,
    explorer,
    viewMode,
    setViewMode,
    registerExplorerActions,
  } = useDriveChrome();

  const [nodes, setNodes] = useState<FsNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trashTarget, setTrashTarget] = useState<FsNode | null>(null);
  const [menuNode, setMenuNode] = useState<FsNode | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedRef = useRef<FsNode | null>(null);

  const inTrash = view === "trash";
  const title =
    view === "recent"
      ? "Recent"
      : view === "trash"
        ? "Recycle Bin"
        : view === "favorites" || view === "starred"
          ? "Favorites"
          : "Files";

  useEffect(() => {
    selectedRef.current = explorer.selected;
  }, [explorer.selected]);

  useEffect(() => {
    const stored = readViewMode();
    setViewMode(stored === "photos" ? "grid" : stored);
  }, [setViewMode]);

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ view });
        const res = await fetch(`/api/fs/browse?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not load files.");
        setNodes((json.nodes as FsNode[]) ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load files.");
        setNodes([]);
      } finally {
        if (!opts?.quiet) setLoading(false);
      }
    },
    [view],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const libraryEpochSeen = useRef(libraryEpoch);
  useEffect(() => {
    if (libraryEpoch === libraryEpochSeen.current) return;
    libraryEpochSeen.current = libraryEpoch;
    void load({ quiet: true });
  }, [libraryEpoch, load]);

  useEffect(() => {
    setExplorer({
      title,
      crumbs: [{ id: null, label: title }],
      itemCount: nodes.length,
      canCreate: false,
      canUpload: false,
      canDelete: Boolean(explorer.selected) && (isAdmin || inTrash),
      canRename: false,
      searchScopeLabel: title,
      parentFolderId: null,
    });
  }, [
    title,
    nodes.length,
    setExplorer,
    explorer.selected,
    isAdmin,
    inTrash,
  ]);

  useEffect(() => {
    setSelectedNode(null);
  }, [view, setSelectedNode]);

  useEffect(() => {
    registerExplorerActions({
      deleteSelection: () => {
        const n = selectedRef.current;
        if (!n) return;
        if (!(isAdmin || inTrash)) return;
        setTrashTarget(n);
      },
      renameSelection: () => {
        /* browse views: rename not available */
      },
    });
    return () => registerExplorerActions(null);
  }, [registerExplorerActions, isAdmin, inTrash]);

  function selectNode(node: FsNode) {
    setExplorer({
      selected: node,
      canDelete: isAdmin || inTrash,
      canRename: false,
    });
  }

  async function toggleFavorite(node: FsNode) {
    const favorited = Boolean(node.favorited);
    try {
      if (favorited) {
        await fetch(
          `/api/fs/favorites?fs_node_id=${encodeURIComponent(node.id)}`,
          { method: "DELETE" },
        );
      } else {
        await fetch("/api/fs/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fs_node_id: node.id }),
        });
      }
      setNodes((prev) =>
        prev
          .map((n) =>
            n.id === node.id ? { ...n, favorited: !favorited } : n,
          )
          .filter((n) =>
            view === "starred" || view === "favorites" ? n.favorited : true,
          ),
      );
      notifyLibraryChange();
    } catch {
      /* ignore */
    }
  }

  function downloadNode(node: FsNode) {
    const jobId = `dl-${Date.now()}`;
    upsertJob({
      id: jobId,
      name: node.name,
      progress: 0,
      kind: "download",
      status: "downloading",
    });
    void fetch(`/api/fs/media/file/${node.id}?download=1`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Download failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = node.name;
        a.click();
        URL.revokeObjectURL(url);
        upsertJob({
          id: jobId,
          name: node.name,
          progress: 100,
          kind: "download",
          status: "done",
        });
        window.setTimeout(() => removeJob(jobId), 1500);
      })
      .catch((err) => {
        upsertJob({
          id: jobId,
          name: node.name,
          progress: 0,
          kind: "download",
          status: "error",
          error: err instanceof Error ? err.message : "Download failed",
        });
      });
  }

  async function restoreNode(node: FsNode) {
    setBusy(true);
    try {
      const res = await fetch(`/api/fs/nodes/${node.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restore: true }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Restore failed");
      }
      setSelectedNode(null);
      await load({ quiet: true });
      notifyLibraryChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmTrash() {
    if (!trashTarget) return;
    setBusy(true);
    const permanent = inTrash;
    try {
      const res = await fetch(
        `/api/fs/nodes/${trashTarget.id}${permanent ? "?permanent=1" : ""}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Delete failed");
      }
      setTrashTarget(null);
      setSelectedNode(null);
      await load({ quiet: true });
      notifyLibraryChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      setTrashTarget(null);
    } finally {
      setBusy(false);
    }
  }

  function openNode(node: FsNode) {
    if (node.node_type === "folder" && !inTrash) {
      router.push(`/?folder=${encodeURIComponent(node.id)}`);
      return;
    }
    if (node.parent_id) {
      router.push(`/?folder=${encodeURIComponent(node.parent_id)}`);
    } else {
      router.push("/");
    }
  }

  const selectedId = explorer.selected?.id ?? null;
  const isGrid = viewMode === "grid";

  function renderIcon(node: FsNode, size = 16) {
    if (node.node_type === "folder") return <FolderGlyph size={size} />;
    if (node.has_thumbnail) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/fs/media/thumbnail/${node.id}`}
          alt=""
          className="rounded object-cover"
          style={{ width: size, height: size }}
        />
      );
    }
    return (
      <div
        className="xp-file-block"
        style={{ width: size, height: Math.round(size * 1.15) }}
      />
    );
  }

  return (
    <div
      className="h-full min-h-0 flex flex-col"
      onClick={() => setSelectedNode(null)}
    >
      {error ? (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded border border-[var(--danger)] bg-[#fff5f4] px-3 py-2 text-[12px]">
          <span className="flex-1">{error}</span>
          <button
            type="button"
            className="xp-nav-btn"
            onClick={() => setError(null)}
          >
            <IconX size={14} />
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="xp-empty">Loading…</div>
      ) : nodes.length === 0 ? (
        <div className="xp-empty">
          {inTrash ? "Recycle Bin is empty." : "No files yet."}
        </div>
      ) : isGrid ? (
        <div className="xp-grid">
          {nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className={`xp-tile${selectedId === node.id ? " is-selected" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                selectNode(node);
              }}
              onDoubleClick={() => openNode(node)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                selectNode(node);
                setMenuNode(node);
              }}
            >
              <div className="xp-tile-icon">{renderIcon(node, 40)}</div>
              <div className="xp-tile-name">{node.name}</div>
            </button>
          ))}
        </div>
      ) : (
        <table className="xp-list">
          <thead>
            <tr>
              <th style={{ width: "42%" }}>Name</th>
              <th style={{ width: "22%" }}>Date modified</th>
              <th style={{ width: "18%" }}>Type</th>
              <th style={{ width: "12%" }}>Size</th>
              <th style={{ width: "6%" }} />
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => (
              <tr
                key={node.id}
                className={`xp-row${selectedId === node.id ? " is-selected" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  selectNode(node);
                }}
                onDoubleClick={() => openNode(node)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  selectNode(node);
                  setMenuNode(node);
                }}
              >
                <td>
                  <span className="xp-name-cell">
                    {renderIcon(node, 16)}
                    <span>{node.name}</span>
                  </span>
                </td>
                <td>{formatModified(node.updated_at || node.created_at)}</td>
                <td>
                  {fileTypeLabel(node.node_type, node.mime_type, node.name)}
                </td>
                <td>
                  {node.node_type === "folder"
                    ? ""
                    : formatBytes(node.size_bytes)}
                </td>
                <td>
                  <button
                    type="button"
                    className="xp-nav-btn"
                    aria-label="More"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectNode(node);
                      setMenuNode(node);
                    }}
                  >
                    <IconDots size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {menuNode ? (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-xs p-2">
            <ul className="menu">
              {menuNode.node_type === "file" && !inTrash ? (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      downloadNode(menuNode);
                      setMenuNode(null);
                    }}
                  >
                    <IconDownload size={16} /> Download
                  </button>
                </li>
              ) : null}
              {!inTrash ? (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      void toggleFavorite(menuNode);
                      setMenuNode(null);
                    }}
                  >
                    {menuNode.favorited ? (
                      <IconStarFilled size={16} />
                    ) : (
                      <IconStar size={16} />
                    )}
                    {menuNode.favorited ? "Unstar" : "Star"}
                  </button>
                </li>
              ) : null}
              {inTrash ? (
                <li>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      void restoreNode(menuNode);
                      setMenuNode(null);
                    }}
                  >
                    Restore
                  </button>
                </li>
              ) : null}
              {isAdmin || inTrash ? (
                <li>
                  <button
                    type="button"
                    className="text-error"
                    onClick={() => {
                      setTrashTarget(menuNode);
                      setMenuNode(null);
                    }}
                  >
                    <IconTrash size={16} />
                    {inTrash ? "Delete permanently" : "Move to trash"}
                  </button>
                </li>
              ) : null}
            </ul>
            <form method="dialog" className="px-2 pb-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm w-full"
                onClick={() => setMenuNode(null)}
              >
                Close
              </button>
            </form>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setMenuNode(null)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}

      {trashTarget ? (
        <ConfirmModal
          title={inTrash ? "Delete permanently?" : "Move to Recycle Bin?"}
          message={
            inTrash
              ? `Permanently delete “${trashTarget.name}”.`
              : `Move “${trashTarget.name}” to Recycle Bin.`
          }
          confirmLabel={inTrash ? "Delete permanently" : "Move to trash"}
          danger
          busy={busy}
          onClose={() => setTrashTarget(null)}
          onConfirm={() => void confirmTrash()}
        />
      ) : null}
    </div>
  );
}
