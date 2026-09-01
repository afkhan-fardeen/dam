"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconDots,
  IconX,
} from "@tabler/icons-react";
import { useDriveChrome } from "@/components/DriveChrome";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  ExplorerContextMenu,
  type ExplorerMenuItem,
} from "@/components/explorer/ExplorerContextMenu";
import { FolderGlyph } from "@/components/explorer/FolderGlyph";
import { uploadFsFileWithProgress } from "@/lib/fsUpload";
import type { FsNode } from "@/lib/types";
import {
  fileTypeLabel,
  formatBytes,
  formatModified,
} from "@/lib/explorerFormat";
import { readViewMode } from "@/lib/uiPrefs";

type Props = {
  isAdmin: boolean;
  profileName: string;
};

export function DriveWorkspace({ isAdmin, profileName }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get("folder");
  const view = searchParams.get("view") || "files";
  const {
    upsertJob,
    removeJob,
    serverOnline,
    uploadRequestId,
    folderRequestId,
    libraryEpoch,
    setPlaceNav,
    notifyLibraryChange,
    setExplorer,
    setSelectedNode,
    explorer,
    viewMode,
    setViewMode,
    registerExplorerActions,
  } = useDriveChrome();

  const [nodes, setNodes] = useState<FsNode[]>([]);
  const [ancestors, setAncestors] = useState<FsNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    node: FsNode | null;
  } | null>(null);
  const [renameNode, setRenameNode] = useState<FsNode | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [trashTarget, setTrashTarget] = useState<FsNode | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastUploadReq = useRef(0);
  const lastFolderReq = useRef(0);
  const selectedRef = useRef<FsNode | null>(null);

  // Open drive: every signed-in user has full create/upload/delete rights
  const editable = true;
  const inTrash = view === "trash";
  void isAdmin;

  useEffect(() => {
    selectedRef.current = explorer.selected;
  }, [explorer.selected]);

  useEffect(() => {
    const stored = readViewMode();
    setViewMode(stored === "photos" ? "grid" : stored);
  }, [setViewMode]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (inTrash) params.set("trash", "1");
      else if (folderId) params.set("parent_id", folderId);
      const res = await fetch(`/api/fs/list?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load");
      setNodes(json.nodes as FsNode[]);

      if (folderId && !inTrash) {
        const chain: FsNode[] = [];
        let cur: string | null = folderId;
        while (cur) {
          const r: Response = await fetch(`/api/fs/nodes/${cur}`);
          const j: { node?: FsNode } = await r.json();
          if (!r.ok || !j.node) break;
          chain.unshift(j.node);
          cur = j.node.parent_id;
        }
        setAncestors(chain);
      } else {
        setAncestors([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [folderId, inTrash]);

  useEffect(() => {
    void load();
  }, [load]);

  const libraryEpochSeen = useRef(libraryEpoch);
  useEffect(() => {
    if (libraryEpoch === libraryEpochSeen.current) return;
    libraryEpochSeen.current = libraryEpoch;
    void load();
  }, [libraryEpoch, load]);

  useEffect(() => {
    const current = ancestors[ancestors.length - 1] ?? null;
    const title = inTrash
      ? "Recycle Bin"
      : current?.name || "Main Drive";
    const crumbs = inTrash
      ? [{ id: null, label: "Recycle Bin" }]
      : [
          { id: null, label: "Main Drive" },
          ...ancestors.map((a) => ({ id: a.id, label: a.name })),
        ];
    const parentFolderId =
      ancestors.length > 1
        ? ancestors[ancestors.length - 2]!.id
        : ancestors.length === 1
          ? null
          : null;

    setExplorer({
      title,
      crumbs,
      itemCount: nodes.length,
      canCreate: editable && !inTrash,
      canUpload: editable && !inTrash && serverOnline,
      searchScopeLabel: title,
      parentFolderId: folderId ? parentFolderId : null,
    });
  }, [
    ancestors,
    editable,
    folderId,
    inTrash,
    nodes.length,
    serverOnline,
    setExplorer,
  ]);

  useEffect(() => {
    setSelectedNode(null);
  }, [folderId, view, setSelectedNode]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/fs/list?folders=1`);
        const json = await res.json();
        if (!res.ok || cancelled) return;
        const fsFolders = (json.nodes as FsNode[]) ?? [];
        const ids = new Set(fsFolders.map((n) => n.id));
        setPlaceNav({
          folders: fsFolders.map((n) => ({
            id: n.id,
            space_id: "",
            parent_folder_id:
              n.parent_id && ids.has(n.parent_id) ? n.parent_id : null,
            name: n.name,
            created_by: n.created_by,
            created_at: n.created_at,
            passcode_enabled: n.passcode_enabled,
          })),
          currentFolderId: folderId,
          onNavigateFolder: (id) => {
            const params = new URLSearchParams();
            if (id) params.set("folder", id);
            router.push(`/?${params.toString()}`);
          },
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      setPlaceNav(null);
    };
  }, [folderId, setPlaceNav, router, libraryEpoch]);

  useEffect(() => {
    if (uploadRequestId === lastUploadReq.current) return;
    lastUploadReq.current = uploadRequestId;
    if (!editable || inTrash) return;
    fileInputRef.current?.click();
  }, [uploadRequestId, editable, inTrash]);

  useEffect(() => {
    if (folderRequestId === lastFolderReq.current) return;
    lastFolderReq.current = folderRequestId;
    if (!editable || inTrash) return;
    setNewFolderOpen(true);
    setNewFolderName("");
  }, [folderRequestId, editable, inTrash]);

  function openFolder(id: string | null) {
    const params = new URLSearchParams();
    if (id) params.set("folder", id);
    router.push(`/?${params.toString()}`);
  }

  function selectNode(node: FsNode) {
    setExplorer({
      selected: node,
      canDelete: editable || inTrash,
      canRename: editable && !inTrash,
    });
  }

  useEffect(() => {
    registerExplorerActions({
      deleteSelection: () => {
        const n = selectedRef.current;
        if (!n) return;
        setTrashTarget(n);
      },
      renameSelection: () => {
        const n = selectedRef.current;
        if (!n || inTrash || !editable) return;
        setRenameValue(n.name);
        setRenameNode(n);
      },
    });
    return () => registerExplorerActions(null);
  }, [registerExplorerActions, inTrash, editable]);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const res = await fetch("/api/fs/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent_id: folderId, name }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not create folder");
      return;
    }
    setNewFolderOpen(false);
    setNewFolderName("");
    notifyLibraryChange();
    await load();
  }

  async function runUpload(files: FileList | File[]) {
    if (!editable || !serverOnline) return;
    for (const file of Array.from(files)) {
      const jobId = `up-${Date.now()}-${file.name}`;
      upsertJob({
        id: jobId,
        name: file.name,
        progress: 0,
        kind: "upload",
        status: "uploading",
      });
      try {
        await uploadFsFileWithProgress({
          file,
          parentId: folderId,
          createdBy: profileName,
          onProgress: (pct) =>
            upsertJob({
              id: jobId,
              name: file.name,
              progress: pct,
              kind: "upload",
              status: pct >= 100 ? "saving" : "uploading",
            }),
        });
        upsertJob({
          id: jobId,
          name: file.name,
          progress: 100,
          kind: "upload",
          status: "done",
        });
        window.setTimeout(() => removeJob(jobId), 1800);
      } catch (err) {
        upsertJob({
          id: jobId,
          name: file.name,
          progress: 0,
          kind: "upload",
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
        });
      }
    }
    notifyLibraryChange();
    await load();
  }

  async function saveRename() {
    if (!renameNode) return;
    const res = await fetch(`/api/fs/nodes/${renameNode.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue.trim() }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Rename failed");
      return;
    }
    setRenameNode(null);
    setSelectedNode(null);
    await load();
  }

  async function confirmTrash() {
    if (!trashTarget) return;
    const permanent = inTrash;
    const res = await fetch(
      `/api/fs/nodes/${trashTarget.id}${permanent ? "?permanent=1" : ""}`,
      { method: "DELETE" },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error || "Delete failed");
      setTrashTarget(null);
      return;
    }
    setTrashTarget(null);
    setSelectedNode(null);
    notifyLibraryChange();
    await load();
  }

  async function restoreNode(node: FsNode) {
    const res = await fetch(`/api/fs/nodes/${node.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: true }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Restore failed");
      return;
    }
    setSelectedNode(null);
    notifyLibraryChange();
    await load();
  }

  async function toggleFavorite(node: FsNode) {
    if (node.favorited) {
      await fetch(`/api/fs/favorites?fs_node_id=${encodeURIComponent(node.id)}`, {
        method: "DELETE",
      });
    } else {
      await fetch("/api/fs/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fs_node_id: node.id }),
      });
    }
    await load();
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

  const selectedId = explorer.selected?.id ?? null;
  const isGrid = viewMode === "grid";

  function onItemClick(e: React.MouseEvent, node: FsNode) {
    e.stopPropagation();
    selectNode(node);
  }

  function onItemDoubleClick(node: FsNode) {
    if (node.node_type === "folder" && !inTrash) openFolder(node.id);
  }

  function renderIcon(node: FsNode, size = 16) {
    if (node.node_type === "folder") return <FolderGlyph size={size} />;
    if (node.has_thumbnail) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/fs/media/thumbnail/${node.id}`}
          alt=""
          width={size}
          height={size}
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
    selectNode(node);
    setCtxMenu({ x: e.clientX, y: e.clientY, node });
  }

  function openEmptyMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedNode(null);
    setCtxMenu({ x: e.clientX, y: e.clientY, node: null });
  }

  function ctxItems(): ExplorerMenuItem[] {
    if (!ctxMenu) return [];
    const node = ctxMenu.node;
    if (!node) {
      return [
        {
          id: "new",
          label: "New folder",
          disabled: !editable || inTrash,
          onSelect: () => {
            setNewFolderOpen(true);
            setNewFolderName("");
          },
        },
        {
          id: "upload",
          label: "Upload",
          disabled: !editable || inTrash || !serverOnline,
          onSelect: () => fileInputRef.current?.click(),
        },
        { id: "sep-r", label: "", separator: true },
        {
          id: "refresh",
          label: "Refresh",
          onSelect: () => void load(),
        },
      ];
    }
    const items: ExplorerMenuItem[] = [];
    if (node.node_type === "folder" && !inTrash) {
      items.push({
        id: "open",
        label: "Open",
        onSelect: () => openFolder(node.id),
      });
    }
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
    if (editable && !inTrash) {
      items.push({
        id: "rename",
        label: "Rename",
        onSelect: () => {
          setRenameValue(node.name);
          setRenameNode(node);
        },
      });
    }
    if (inTrash && editable) {
      items.push({
        id: "restore",
        label: "Restore",
        onSelect: () => void restoreNode(node),
      });
    }
    if (editable || inTrash) {
      items.push({ id: "sep-d", label: "", separator: true });
      items.push({
        id: "delete",
        label: inTrash ? "Delete permanently" : "Move to Recycle Bin",
        danger: true,
        onSelect: () => setTrashTarget(node),
      });
    }
    return items;
  }

  return (
    <div
      className="h-full min-h-0 flex flex-col"
      onClick={() => setSelectedNode(null)}
      onContextMenu={openEmptyMenu}
      onDragOver={(e) => {
        e.preventDefault();
        if (editable && !inTrash) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files?.length) void runUpload(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void runUpload(e.target.files);
          e.target.value = "";
        }}
      />

      {error ? (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded border border-[var(--danger)] bg-[#fff5f4] px-3 py-2 text-[12px]">
          <span className="flex-1">{error}</span>
          <button type="button" className="xp-nav-btn" onClick={() => setError(null)}>
            <IconX size={14} />
          </button>
        </div>
      ) : null}

      {dragging ? (
        <div className="m-3 rounded border-2 border-dashed border-[var(--win-accent)] p-8 text-center text-[13px] text-[var(--win-accent)]">
          Drop files to upload
        </div>
      ) : null}

      {loading ? (
        <div className="xp-empty">Loading…</div>
      ) : nodes.length === 0 ? (
        <div className="xp-empty">
          {inTrash
            ? "Recycle Bin is empty."
            : "This folder is empty. Use New or Upload to add items."}
        </div>
      ) : isGrid ? (
        <div className="xp-grid">
          {nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              className={`xp-tile${selectedId === node.id ? " is-selected" : ""}`}
              onClick={(e) => onItemClick(e, node)}
              onDoubleClick={() => onItemDoubleClick(node)}
              onContextMenu={(e) => openItemMenu(e, node)}
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
                className={`xp-row${selectedId === node.id ? " is-selected" : ""}`}
                onClick={(e) => onItemClick(e, node)}
                onDoubleClick={() => onItemDoubleClick(node)}
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

      {newFolderOpen ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold">New folder</h3>
            <input
              className="input input-bordered mt-3 w-full"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void createFolder();
              }}
            />
            <div className="modal-action">
              <button
                type="button"
                className="btn"
                onClick={() => setNewFolderOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-neutral"
                onClick={() => void createFolder()}
              >
                Create
              </button>
            </div>
          </div>
        </dialog>
      ) : null}

      {renameNode ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold">Rename</h3>
            <input
              className="input input-bordered mt-3 w-full"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveRename();
              }}
            />
            <div className="modal-action">
              <button
                type="button"
                className="btn"
                onClick={() => setRenameNode(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-neutral"
                onClick={() => void saveRename()}
              >
                Save
              </button>
            </div>
          </div>
        </dialog>
      ) : null}

      {trashTarget ? (
        <ConfirmModal
          title={inTrash ? "Delete permanently?" : "Move to Recycle Bin?"}
          message={
            inTrash
              ? `Permanently delete “${trashTarget.name}”. This cannot be undone.`
              : `Move “${trashTarget.name}” to Recycle Bin.`
          }
          confirmLabel={inTrash ? "Delete permanently" : "Move to trash"}
          danger
          onConfirm={() => void confirmTrash()}
          onClose={() => setTrashTarget(null)}
        />
      ) : null}
    </div>
  );
}
