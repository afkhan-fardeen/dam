"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconDots,
  IconX,
} from "@tabler/icons-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  ExplorerContextMenu,
  type ExplorerMenuItem,
} from "@/components/explorer/ExplorerContextMenu";
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

export function FsBrowseClient({ isAdmin: _isAdmin }: Props) {
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
    setSelection,
    clearSelection,
    explorer,
    viewMode,
    setViewMode,
    registerExplorerActions,
  } = useDriveChrome();

  const [nodes, setNodes] = useState<FsNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trashTargets, setTrashTargets] = useState<FsNode[] | null>(null);
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    node: FsNode | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedRef = useRef<FsNode | null>(null);
  const selectedIdsRef = useRef<string[]>([]);
  const nodesRef = useRef<FsNode[]>([]);
  const anchorIdRef = useRef<string | null>(null);

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
    selectedIdsRef.current = explorer.selectedIds ?? [];
  }, [explorer.selected, explorer.selectedIds]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

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
    const n = explorer.selectedIds?.length || 0;
    setExplorer({
      title,
      crumbs: [{ id: null, label: title }],
      itemCount: nodes.length,
      canCreate: false,
      canUpload: false,
      canDelete: n > 0,
      canRename: false,
      searchScopeLabel: title,
      parentFolderId: null,
    });
  }, [title, nodes.length, setExplorer, explorer.selectedIds, inTrash]);

  useEffect(() => {
    clearSelection();
  }, [view, clearSelection]);

  useEffect(() => {
    registerExplorerActions({
      deleteSelection: () => {
        const ids = selectedIdsRef.current;
        const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
        const list = ids
          .map((id) => byId.get(id))
          .filter(Boolean) as FsNode[];
        if (list.length === 0) return;
        setTrashTargets(list);
      },
      renameSelection: () => {
        /* browse views: rename not available */
      },
    });
    return () => registerExplorerActions(null);
  }, [registerExplorerActions]);

  function applySelection(ids: string[], primaryId?: string) {
    const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
    const selectedNodes = ids
      .map((id) => byId.get(id))
      .filter(Boolean) as FsNode[];
    const primary =
      (primaryId ? byId.get(primaryId) : null) ??
      selectedNodes[selectedNodes.length - 1] ??
      null;
    setSelection(selectedNodes, primary);
    setExplorer({ canDelete: selectedNodes.length > 0, canRename: false });
  }

  function onItemClick(e: React.MouseEvent, node: FsNode) {
    e.stopPropagation();
    const ordered = nodesRef.current.map((n) => n.id);
    const meta = e.metaKey || e.ctrlKey;
    if (e.shiftKey && anchorIdRef.current) {
      const a = ordered.indexOf(anchorIdRef.current);
      const b = ordered.indexOf(node.id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        applySelection(ordered.slice(lo, hi + 1), node.id);
        return;
      }
    }
    if (meta) {
      const cur = new Set(selectedIdsRef.current);
      if (cur.has(node.id)) cur.delete(node.id);
      else cur.add(node.id);
      anchorIdRef.current = node.id;
      applySelection([...cur], node.id);
      return;
    }
    anchorIdRef.current = node.id;
    applySelection([node.id], node.id);
  }

  function selectNode(node: FsNode) {
    applySelection([node.id], node.id);
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
    if (!trashTargets?.length) return;
    setBusy(true);
    const permanent = inTrash;
    const targets = trashTargets;
    const ids = new Set(targets.map((t) => t.id));
    setTrashTargets(null);
    setNodes((prev) => prev.filter((n) => !ids.has(n.id)));
    clearSelection();
    try {
      for (const target of targets) {
        const res = await fetch(
          `/api/fs/nodes/${target.id}${permanent ? "?permanent=1" : ""}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || "Delete failed");
        }
      }
      notifyLibraryChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      void load({ quiet: true });
    } finally {
      setBusy(false);
    }
  }

  async function emptyTrash() {
    setEmptyTrashOpen(false);
    setBusy(true);
    try {
      const res = await fetch("/api/fs/trash/empty", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Empty trash failed");
      setNodes([]);
      clearSelection();
      notifyLibraryChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Empty trash failed");
      void load({ quiet: true });
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

  const selectedIds = new Set(explorer.selectedIds ?? []);
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

  function openItemMenu(e: React.MouseEvent, node: FsNode) {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedIds.has(node.id)) selectNode(node);
    setCtxMenu({ x: e.clientX, y: e.clientY, node });
  }

  function openEmptyMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    clearSelection();
    setCtxMenu({ x: e.clientX, y: e.clientY, node: null });
  }

  function ctxItems(): ExplorerMenuItem[] {
    if (!ctxMenu) return [];
    const node = ctxMenu.node;
    if (!node) {
      const items: ExplorerMenuItem[] = [
        {
          id: "select-all",
          label: "Select all",
          onSelect: () => applySelection(nodesRef.current.map((n) => n.id)),
        },
        {
          id: "refresh",
          label: "Refresh",
          onSelect: () => void load({ quiet: true }),
        },
      ];
      if (inTrash) {
        items.push(
          { id: "sep-e", label: "", separator: true },
          {
            id: "empty",
            label: "Empty Recycle Bin",
            danger: true,
            disabled: nodes.length === 0,
            onSelect: () => setEmptyTrashOpen(true),
          },
        );
      }
      return items;
    }
    const items: ExplorerMenuItem[] = [];
    items.push({
      id: "open",
      label: "Open",
      onSelect: () => openNode(node),
    });
    if (node.node_type === "file" && !inTrash) {
      items.push({
        id: "download",
        label: "Download",
        onSelect: () => downloadNode(node),
      });
    }
    if (!inTrash) {
      items.push({
        id: "star",
        label: node.favorited ? "Unstar" : "Star",
        onSelect: () => void toggleFavorite(node),
      });
    }
    if (inTrash) {
      items.push({
        id: "restore",
        label: "Restore",
        disabled: busy,
        onSelect: () => void restoreNode(node),
      });
    }
    items.push({ id: "sep-d", label: "", separator: true });
    items.push({
      id: "delete",
      label: inTrash ? "Delete permanently" : "Move to Recycle Bin",
      danger: true,
      onSelect: () => {
        const ids = selectedIds.has(node.id)
          ? [...selectedIds]
          : [node.id];
        const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
        setTrashTargets(
          ids.map((id) => byId.get(id)).filter(Boolean) as FsNode[],
        );
      },
    });
    return items;
  }

  return (
    <div
      className="h-full min-h-0 flex flex-col"
      onClick={() => clearSelection()}
      onContextMenu={openEmptyMenu}
    >
      {inTrash && nodes.length > 0 ? (
        <div className="xp-toolbar-row">
          <button
            type="button"
            className="xp-cmd"
            onClick={() =>
              applySelection(nodesRef.current.map((n) => n.id))
            }
          >
            Select all
          </button>
          <button
            type="button"
            className="xp-cmd"
            onClick={() => setEmptyTrashOpen(true)}
          >
            Empty Trash
          </button>
        </div>
      ) : null}

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
              className={`xp-tile${selectedIds.has(node.id) ? " is-selected" : ""}`}
              onClick={(e) => onItemClick(e, node)}
              onDoubleClick={() => openNode(node)}
              onContextMenu={(e) => openItemMenu(e, node)}
            >
              <div className="xp-tile-icon xp-tile-icon-lg">
                {renderIcon(node, 72)}
              </div>
              <div className="xp-tile-name">{node.name}</div>
            </button>
          ))}
        </div>
      ) : (
        <table className="xp-list">
          <thead>
            <tr>
              <th style={{ width: "42%" }}>Name</th>
              <th className="xp-col-date" style={{ width: "22%" }}>
                Date modified
              </th>
              <th className="xp-col-type" style={{ width: "18%" }}>
                Type
              </th>
              <th className="xp-col-size" style={{ width: "12%" }}>
                Size
              </th>
              <th style={{ width: "6%" }} />
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => (
              <tr
                key={node.id}
                className={`xp-row${selectedIds.has(node.id) ? " is-selected" : ""}`}
                onClick={(e) => onItemClick(e, node)}
                onDoubleClick={() => openNode(node)}
                onContextMenu={(e) => openItemMenu(e, node)}
              >
                <td>
                  <span className="xp-name-cell">
                    {renderIcon(node, 16)}
                    <span>{node.name}</span>
                  </span>
                </td>
                <td className="xp-col-date">
                  {formatModified(node.updated_at || node.created_at)}
                </td>
                <td className="xp-col-type">
                  {fileTypeLabel(node.node_type, node.mime_type, node.name)}
                </td>
                <td className="xp-col-size">
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
                      openItemMenu(e, node);
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

      {ctxMenu ? (
        <ExplorerContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxItems()}
          onClose={() => setCtxMenu(null)}
        />
      ) : null}

      {trashTargets ? (
        <ConfirmModal
          title={inTrash ? "Delete permanently?" : "Move to Recycle Bin?"}
          message={
            inTrash
              ? `Permanently delete ${trashTargets.length} item${
                  trashTargets.length === 1 ? "" : "s"
                }.`
              : `Move ${trashTargets.length} item${
                  trashTargets.length === 1 ? "" : "s"
                } to Recycle Bin.`
          }
          confirmLabel={inTrash ? "Delete permanently" : "Move to trash"}
          danger
          onClose={() => setTrashTargets(null)}
          onConfirm={() => void confirmTrash()}
        />
      ) : null}

      {emptyTrashOpen ? (
        <ConfirmModal
          title="Empty Recycle Bin?"
          message="Permanently delete everything in Recycle Bin. This cannot be undone."
          confirmLabel="Empty Trash"
          danger
          onClose={() => setEmptyTrashOpen(false)}
          onConfirm={() => void emptyTrash()}
        />
      ) : null}
    </div>
  );
}
