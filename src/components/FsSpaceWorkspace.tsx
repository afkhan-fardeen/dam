"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  IconDots,
  IconDownload,
  IconFolder,
  IconFolderPlus,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useDriveChrome } from "@/components/DriveChrome";
import { ConfirmModal } from "@/components/ConfirmModal";
import { uploadFsFileWithProgress } from "@/lib/fsUpload";
import { canDownload, canEdit, type FsNode, type Space, type SpaceRole } from "@/lib/types";
import { getTagChipStyles } from "@/lib/categories";

type Props = {
  space: Space;
  role: SpaceRole | null;
  isAdmin: boolean;
  profileName: string;
};

export function FsSpaceWorkspace({
  space,
  role,
  isAdmin,
  profileName,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get("folder");
  const view = searchParams.get("view") || "all";
  const { upsertJob, removeJob, serverOnline, uploadRequestId, folderRequestId, libraryEpoch, setPlaceNav, notifyLibraryChange } =
    useDriveChrome();

  const editable = canEdit(role, isAdmin);
  const downloadable = canDownload(role, isAdmin);

  const [nodes, setNodes] = useState<FsNode[]>([]);
  const [ancestors, setAncestors] = useState<FsNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [menuNode, setMenuNode] = useState<FsNode | null>(null);
  const [renameNode, setRenameNode] = useState<FsNode | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [trashTarget, setTrashTarget] = useState<FsNode | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastUploadReq = useRef(0);
  const lastFolderReq = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ space_id: space.id });
      if (view === "trash") params.set("trash", "1");
      else if (folderId) params.set("parent_id", folderId);
      const res = await fetch(`/api/fs/list?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not load");
      setNodes(json.nodes as FsNode[]);

      // Breadcrumb chain
      if (folderId && view !== "trash") {
        const chain: FsNode[] = [];
        let cur: string | null = folderId;
        while (cur) {
          const r: Response = await fetch(`/api/fs/nodes/${cur}`);
          const j: { node?: FsNode; error?: string } = await r.json();
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
  }, [space.id, folderId, view]);

  useEffect(() => {
    void load();
  }, [load]);

  // Soft-reload when shell uploads finish
  const libraryEpochSeen = useRef(libraryEpoch);
  useEffect(() => {
    if (libraryEpoch === libraryEpochSeen.current) return;
    libraryEpochSeen.current = libraryEpoch;
    void load();
  }, [libraryEpoch, load]);

  // Sidebar folder tree for this space
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/fs/list?space_id=${encodeURIComponent(space.id)}&folders=1`,
        );
        const json = await res.json();
        if (!res.ok || cancelled) return;
        const fsFolders = (json.nodes as FsNode[]) ?? [];
        const ids = new Set(fsFolders.map((n) => n.id));
        setPlaceNav({
          spaceSlug: space.slug,
          spaceName: space.name,
          spaceId: space.id,
          folders: fsFolders.map((n) => ({
            id: n.id,
            space_id: n.space_id,
            parent_folder_id:
              n.parent_id && ids.has(n.parent_id) ? n.parent_id : null,
            name: n.name,
            created_by: n.created_by,
            created_at: n.created_at,
            passcode_enabled: n.passcode_enabled,
          })),
          currentFolderId: folderId,
          onNavigateFolder: (id) => {
            const params = new URLSearchParams(window.location.search);
            if (id) params.set("folder", id);
            else params.delete("folder");
            params.delete("view");
            router.push(`/s/${space.slug}?${params.toString()}`);
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
  }, [
    space.id,
    space.slug,
    space.name,
    folderId,
    setPlaceNav,
    router,
    libraryEpoch,
  ]);

  useEffect(() => {
    if (uploadRequestId === lastUploadReq.current) return;
    lastUploadReq.current = uploadRequestId;
    if (!editable || view === "trash") return;
    fileInputRef.current?.click();
  }, [uploadRequestId, editable, view]);

  useEffect(() => {
    if (folderRequestId === lastFolderReq.current) return;
    lastFolderReq.current = folderRequestId;
    if (!editable || view === "trash") return;
    setNewFolderOpen(true);
    setNewFolderName("");
  }, [folderRequestId, editable, view]);

  function openFolder(id: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("folder", id);
    else params.delete("folder");
    params.delete("view");
    router.push(`/s/${space.slug}?${params.toString()}`);
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const res = await fetch("/api/fs/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        space_id: space.id,
        parent_id: folderId,
        name,
      }),
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
          spaceId: space.id,
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
    await load();
  }

  async function confirmTrash() {
    if (!trashTarget) return;
    const permanent = view === "trash";
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
    setMenuNode(null);
    await load();
  }

  async function restoreNode(node: FsNode) {
    const res = await fetch(`/api/fs/nodes/${node.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: true }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Restore failed");
      return;
    }
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

  const folders = useMemo(
    () => nodes.filter((n) => n.node_type === "folder"),
    [nodes],
  );
  const files = useMemo(
    () => nodes.filter((n) => n.node_type === "file"),
    [nodes],
  );

  return (
    <div
      className={`flex flex-col gap-4 p-4 sm:p-5 w-full min-h-[60vh] relative ${
        dragging ? "outline outline-2 outline-dashed outline-primary" : ""
      }`}
      onDragEnter={(e) => {
        e.preventDefault();
        if (editable) setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files?.length) {
          void runUpload(e.dataTransfer.files);
        }
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => {
          if (e.target.files?.length) void runUpload(e.target.files);
          e.target.value = "";
        }}
      />

      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap items-center gap-1 type-body flex-1 min-w-0">
          <button
            type="button"
            className="link link-hover"
            onClick={() => openFolder(null)}
          >
            {space.name}
          </button>
          {ancestors.map((a) => (
            <span key={a.id} className="flex items-center gap-1">
              <span className="opacity-40">/</span>
              <button
                type="button"
                className="link link-hover truncate max-w-[10rem]"
                onClick={() => openFolder(a.id)}
              >
                {a.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="flex gap-1">
          {editable && view !== "trash" ? (
            <>
              <button
                type="button"
                className="btn btn-ghost btn-sm gap-1"
                onClick={() => setNewFolderOpen(true)}
              >
                <IconFolderPlus size={16} />
                New folder
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm gap-1"
                disabled={!serverOnline}
                onClick={() => fileInputRef.current?.click()}
              >
                <IconUpload size={16} />
                Upload
              </button>
            </>
          ) : null}
        </div>
      </div>

      {error ? <p className="type-caption text-error">{error}</p> : null}
      {loading ? (
        <p className="type-caption opacity-60">Loading…</p>
      ) : nodes.length === 0 ? (
        <p className="type-caption opacity-60">
          {view === "trash" ? "Trash is empty." : "This folder is empty."}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {folders.map((n) => (
            <NodeRow
              key={n.id}
              node={n}
              selected={selectedIds.has(n.id)}
              onSelect={() =>
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(n.id)) next.delete(n.id);
                  else next.add(n.id);
                  return next;
                })
              }
              onOpen={() => openFolder(n.id)}
              onMenu={() => setMenuNode(n)}
              onFavorite={() => void toggleFavorite(n)}
            />
          ))}
          {files.map((n) => (
            <NodeRow
              key={n.id}
              node={n}
              selected={selectedIds.has(n.id)}
              onSelect={() =>
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(n.id)) next.delete(n.id);
                  else next.add(n.id);
                  return next;
                })
              }
              onOpen={() => {
                window.open(`/api/fs/media/file/${n.id}`, "_blank");
              }}
              onMenu={() => setMenuNode(n)}
              onFavorite={() => void toggleFavorite(n)}
              thumbUrl={
                n.has_thumbnail
                  ? `/api/fs/media/thumbnail/${n.id}`
                  : null
              }
            />
          ))}
        </div>
      )}

      {menuNode ? (
        <dialog className="modal modal-open" onClick={() => setMenuNode(null)}>
          <div
            className="modal-box max-w-xs rounded-none p-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-base-300 flex items-center gap-2">
              <p className="type-title flex-1 truncate">{menuNode.name}</p>
              <button
                type="button"
                className="btn btn-ghost btn-sm btn-square"
                onClick={() => setMenuNode(null)}
              >
                <IconX size={16} />
              </button>
            </div>
            <ul className="menu p-2 type-body">
              {menuNode.node_type === "file" && downloadable ? (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      const target = menuNode;
                      setMenuNode(null);
                      const jobId = `dl-${Date.now()}`;
                      upsertJob({
                        id: jobId,
                        name: target.name,
                        progress: 0,
                        kind: "download",
                        status: "downloading",
                      });
                      void fetch(`/api/fs/media/file/${target.id}?download=1`)
                        .then(async (res) => {
                          if (!res.ok) throw new Error("Download failed");
                          const blob = await res.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = target.name;
                          a.click();
                          URL.revokeObjectURL(url);
                          upsertJob({
                            id: jobId,
                            name: target.name,
                            progress: 100,
                            kind: "download",
                            status: "done",
                          });
                          window.setTimeout(() => removeJob(jobId), 1500);
                        })
                        .catch((err) => {
                          upsertJob({
                            id: jobId,
                            name: target.name,
                            progress: 0,
                            kind: "download",
                            status: "error",
                            error:
                              err instanceof Error
                                ? err.message
                                : "Download failed",
                          });
                        });
                    }}
                  >
                    <IconDownload size={16} /> Download
                  </button>
                </li>
              ) : null}
              {editable && view !== "trash" ? (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setRenameValue(menuNode.name);
                      setRenameNode(menuNode);
                      setMenuNode(null);
                    }}
                  >
                    Rename
                  </button>
                </li>
              ) : null}
              {view === "trash" && editable ? (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      void restoreNode(menuNode);
                      setMenuNode(null);
                    }}
                  >
                    Restore
                  </button>
                </li>
              ) : null}
              {editable ? (
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
                    {view === "trash" ? "Delete permanently" : "Move to trash"}
                  </button>
                </li>
              ) : null}
            </ul>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setMenuNode(null)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}

      {newFolderOpen ? (
        <dialog className="modal modal-open">
          <form
            className="modal-box max-w-sm rounded-none"
            onSubmit={(e) => {
              e.preventDefault();
              void createFolder();
            }}
          >
            <h3 className="type-title mb-3">New folder</h3>
            <input
              autoFocus
              className="input input-bordered input-sm w-full"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
            />
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setNewFolderOpen(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                Create
              </button>
            </div>
          </form>
        </dialog>
      ) : null}

      {renameNode ? (
        <dialog className="modal modal-open">
          <form
            className="modal-box max-w-sm rounded-none"
            onSubmit={(e) => {
              e.preventDefault();
              void saveRename();
            }}
          >
            <h3 className="type-title mb-3">Rename</h3>
            <input
              autoFocus
              className="input input-bordered input-sm w-full"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
            />
            <div className="modal-action">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setRenameNode(null)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm">
                Save
              </button>
            </div>
          </form>
        </dialog>
      ) : null}

      {trashTarget ? (
        <ConfirmModal
          title={view === "trash" ? "Delete permanently?" : "Move to trash?"}
          message={
            view === "trash"
              ? `Permanently delete “${trashTarget.name}” from trash. This cannot be undone.`
              : `Move “${trashTarget.name}” to trash. You can restore it later.`
          }
          confirmLabel={view === "trash" ? "Delete permanently" : "Move to trash"}
          danger
          onConfirm={() => void confirmTrash()}
          onClose={() => setTrashTarget(null)}
        />
      ) : null}
    </div>
  );
}

function NodeRow({
  node,
  selected,
  onSelect,
  onOpen,
  onMenu,
  onFavorite,
  thumbUrl,
}: {
  node: FsNode;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onMenu: () => void;
  onFavorite: () => void;
  thumbUrl?: string | null;
}) {
  const tags = node.tags ?? [];
  return (
    <div
      className={`flex items-center gap-2 px-2 py-2 hover:bg-base-200 ${
        selected ? "bg-base-200" : ""
      }`}
    >
      <input
        type="checkbox"
        className="checkbox checkbox-xs"
        checked={selected}
        onChange={onSelect}
      />
      {node.node_type === "folder" ? (
        <IconFolder size={18} className="text-primary shrink-0" />
      ) : thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbUrl} alt="" className="h-8 w-8 object-cover shrink-0" />
      ) : (
        <div className="h-8 w-8 bg-base-300 shrink-0" />
      )}
      <button
        type="button"
        className="type-body truncate flex-1 text-left"
        onDoubleClick={onOpen}
        onClick={onOpen}
      >
        {node.name}
      </button>
      {tags.slice(0, 3).map((t) => {
        const chip = getTagChipStyles(t.name);
        return (
          <span
            key={t.id}
            className="badge badge-sm font-normal hidden sm:inline-flex"
            style={chip.style}
          >
            {t.name}
          </span>
        );
      })}
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-circle"
        onClick={onFavorite}
        aria-label={node.favorited ? "Unstar" : "Star"}
      >
        {node.favorited ? (
          <IconStarFilled size={14} className="text-warning" />
        ) : (
          <IconStar size={14} />
        )}
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-xs btn-circle"
        onClick={onMenu}
        aria-label="Actions"
      >
        <IconDots size={16} />
      </button>
    </div>
  );
}
