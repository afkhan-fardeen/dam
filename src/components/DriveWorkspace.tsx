"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconDots, IconX } from "@tabler/icons-react";
import { useDriveChrome } from "@/components/DriveChrome";
import { ConfirmModal } from "@/components/ConfirmModal";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
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
import {
  readExplorerSort,
  readViewMode,
  writeExplorerSort,
  type ExplorerSortKey,
  type ExplorerSortPrefs,
} from "@/lib/uiPrefs";
import { useToast } from "@/components/ui/Toast";

type Props = {
  isAdmin: boolean;
  profileName: string;
};

function sortNodes(nodes: FsNode[], prefs: ExplorerSortPrefs): FsNode[] {
  const dir = prefs.asc ? 1 : -1;
  const rank = (n: FsNode) =>
    prefs.foldersFirst ? (n.node_type === "folder" ? 0 : 1) : 0;
  return nodes.slice().sort((a, b) => {
    const fr = rank(a) - rank(b);
    if (fr !== 0) return fr;
    switch (prefs.key) {
      case "size": {
        const as = a.size_bytes ?? -1;
        const bs = b.size_bytes ?? -1;
        if (as !== bs) return (as - bs) * dir;
        break;
      }
      case "kind": {
        const ak = fileTypeLabel(a.node_type, a.mime_type, a.name);
        const bk = fileTypeLabel(b.node_type, b.mime_type, b.name);
        const c = ak.localeCompare(bk);
        if (c !== 0) return c * dir;
        break;
      }
      case "date": {
        const at = new Date(a.updated_at || a.created_at || 0).getTime();
        const bt = new Date(b.updated_at || b.created_at || 0).getTime();
        if (at !== bt) return (at - bt) * dir;
        break;
      }
      default:
        break;
    }
    return a.name.localeCompare(b.name) * dir;
  });
}

export function DriveWorkspace({ isAdmin, profileName }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const folderId = searchParams.get("folder");
  const view = searchParams.get("view") || "files";
  const toast = useToast();
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
    setSelection,
    clearSelection,
    explorer,
    viewMode,
    setViewMode,
    registerExplorerActions,
    openPreview,
  } = useDriveChrome();

  const folderIdRef = useRef(folderId);
  folderIdRef.current = folderId;

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
  const [newFolderTags, setNewFolderTags] = useState("");
  const [newFolderDesc, setNewFolderDesc] = useState("");
  const [trashTargets, setTrashTargets] = useState<FsNode[] | null>(null);
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [sortPrefs, setSortPrefs] = useState<ExplorerSortPrefs>(() =>
    readExplorerSort(),
  );
  const [filterText, setFilterText] = useState("");
  const [marquee, setMarquee] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const lastUploadReq = useRef(0);
  const lastFolderReq = useRef(0);
  const selectedRef = useRef<FsNode | null>(null);
  const selectedIdsRef = useRef<string[]>([]);
  const nodesRef = useRef<FsNode[]>([]);
  const orderedIdsRef = useRef<string[]>([]);
  const anchorIdRef = useRef<string | null>(null);
  const itemElsRef = useRef<Map<string, HTMLElement>>(new Map());

  const editable = true;
  const inTrash = view === "trash";
  void isAdmin;

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
        const params = new URLSearchParams();
        if (inTrash) params.set("trash", "1");
        else if (folderId) params.set("parent_id", folderId);
        const res = await fetch(`/api/fs/list?${params}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Could not load");
        setNodes(json.nodes as FsNode[]);
        setAncestors(
          !inTrash && folderId
            ? ((json.ancestors as FsNode[]) ?? [])
            : [],
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Load failed");
      } finally {
        setLoading(false);
      }
    },
    [folderId, inTrash],
  );

  useEffect(() => {
    void load({ quiet: true });
  }, [load]);

  const libraryEpochSeen = useRef(libraryEpoch);
  useEffect(() => {
    if (libraryEpoch === libraryEpochSeen.current) return;
    libraryEpochSeen.current = libraryEpoch;
    void load({ quiet: true });
  }, [libraryEpoch, load]);

  const displayed = useMemo(() => {
    const q = filterText.trim().toLowerCase();
    const filtered = q
      ? nodes.filter((n) => n.name.toLowerCase().includes(q))
      : nodes;
    return sortNodes(filtered, sortPrefs);
  }, [nodes, filterText, sortPrefs]);

  useEffect(() => {
    orderedIdsRef.current = displayed.map((n) => n.id);
  }, [displayed]);

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
      ancestors.length > 1 ? ancestors[ancestors.length - 2]!.id : null;

    setExplorer({
      title,
      crumbs,
      itemCount: displayed.length,
      canCreate: editable && !inTrash,
      canUpload: editable && !inTrash && serverOnline,
      canDelete: editable || inTrash,
      canRename: editable && !inTrash,
      searchScopeLabel: title,
      parentFolderId: folderId ? parentFolderId : null,
    });
  }, [
    ancestors,
    displayed.length,
    editable,
    folderId,
    inTrash,
    serverOnline,
    setExplorer,
  ]);

  useEffect(() => {
    clearSelection();
    anchorIdRef.current = null;
  }, [folderId, view, clearSelection]);

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
          currentFolderId: folderIdRef.current,
          onNavigateFolder: (id) => {
            const params = new URLSearchParams();
            if (id) params.set("folder", id);
            router.push(`/?${params.toString()}`);
          },
          onPrefetchFolder: (id) => {
            const params = new URLSearchParams();
            if (id) params.set("parent_id", id);
            void fetch(`/api/fs/list?${params}`);
          },
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setPlaceNav, router, libraryEpoch]); // eslint-disable-line react-hooks/exhaustive-deps -- folderId patched below

  useEffect(() => {
    setPlaceNav((prev) =>
      prev ? { ...prev, currentFolderId: folderId } : prev,
    );
  }, [folderId, setPlaceNav]);

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
    setNewFolderTags("");
    setNewFolderDesc("");
  }, [folderRequestId, editable, inTrash]);

  function openFolder(id: string | null) {
    const params = new URLSearchParams();
    if (id) params.set("folder", id);
    router.push(`/?${params.toString()}`);
  }

  function applySelection(ids: string[], primaryId?: string | null) {
    const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
    const selectedNodes = ids
      .map((id) => byId.get(id))
      .filter(Boolean) as FsNode[];
    const primary =
      (primaryId ? byId.get(primaryId) : null) ??
      selectedNodes[selectedNodes.length - 1] ??
      null;
    setSelection(selectedNodes, primary);
    setExplorer({
      canDelete: selectedNodes.length > 0 && (editable || inTrash),
      canRename:
        selectedNodes.length === 1 && editable && !inTrash,
    });
  }

  function onItemClick(e: React.MouseEvent, node: FsNode) {
    e.stopPropagation();
    const ordered = orderedIdsRef.current;
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        applySelection(orderedIdsRef.current);
      }
      if (e.key === "Enter") {
        const n = selectedRef.current;
        if (!n) return;
        if (n.node_type === "folder" && !inTrash) {
          openFolder(n.id);
        } else if (n.node_type === "file") {
          openPreview(n);
        }
      }
      if (e.key === "Escape") {
        clearSelection();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
        const n = selectedRef.current;
        if (!n || inTrash || !editable) return;
        if ((selectedIdsRef.current.length || 0) !== 1) return;
        setRenameValue(n.name);
        setRenameNode(n);
      },
    });
    return () => registerExplorerActions(null);
  }, [registerExplorerActions, inTrash, editable]);

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const tags = newFolderTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const res = await fetch("/api/fs/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parent_id: folderId,
        name,
        description: newFolderDesc.trim() || null,
        tags,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not create folder");
      toast.error(json.error || "Could not create folder");
      return;
    }
    setNewFolderOpen(false);
    setNewFolderName("");
    setNewFolderTags("");
    setNewFolderDesc("");
    if (json.node) {
      setNodes((prev) => [...prev, json.node as FsNode]);
    }
    toast.success(`Created “${name}”`);
    notifyLibraryChange();
    void load({ quiet: true });
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
    void load({ quiet: true });
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
    setNodes((prev) =>
      prev.map((n) =>
        n.id === renameNode.id
          ? { ...n, name: renameValue.trim(), ...(json.node || {}) }
          : n,
      ),
    );
    clearSelection();
    notifyLibraryChange();
  }

  async function confirmTrash() {
    if (!trashTargets?.length) return;
    const permanent = inTrash;
    const targets = trashTargets;
    const ids = new Set(targets.map((t) => t.id));
    setTrashTargets(null);
    setNodes((prev) => prev.filter((n) => !ids.has(n.id)));
    clearSelection();

    for (const target of targets) {
      const jobId = `del-${target.id}-${Date.now()}`;
      upsertJob({
        id: jobId,
        name: target.name,
        progress: 0,
        kind: permanent ? "delete" : "trash",
        status: "saving",
      });
      try {
        const res = await fetch(
          `/api/fs/nodes/${target.id}${permanent ? "?permanent=1" : ""}`,
          { method: "DELETE" },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Delete failed");
        upsertJob({
          id: jobId,
          name: target.name,
          progress: 100,
          kind: permanent ? "delete" : "trash",
          status: "done",
        });
        window.setTimeout(() => removeJob(jobId), 1600);
      } catch (err) {
        upsertJob({
          id: jobId,
          name: target.name,
          progress: 0,
          kind: permanent ? "delete" : "trash",
          status: "error",
          error: err instanceof Error ? err.message : "Delete failed",
        });
        toast.error(
          err instanceof Error ? err.message : "Delete failed",
        );
        void load({ quiet: true });
      }
    }
    notifyLibraryChange();
  }

  async function emptyTrash() {
    setEmptyTrashOpen(false);
    const jobId = `empty-trash-${Date.now()}`;
    upsertJob({
      id: jobId,
      name: "Empty Recycle Bin",
      progress: 0,
      kind: "delete",
      status: "saving",
    });
    try {
      const res = await fetch("/api/fs/trash/empty", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Empty trash failed");
      setNodes([]);
      clearSelection();
      upsertJob({
        id: jobId,
        name: "Empty Recycle Bin",
        progress: 100,
        kind: "delete",
        status: "done",
      });
      window.setTimeout(() => removeJob(jobId), 1800);
      notifyLibraryChange();
    } catch (err) {
      upsertJob({
        id: jobId,
        name: "Empty Recycle Bin",
        progress: 0,
        kind: "delete",
        status: "error",
        error: err instanceof Error ? err.message : "Empty trash failed",
      });
      void load({ quiet: true });
    }
  }

  async function restoreNode(node: FsNode) {
    setNodes((prev) => prev.filter((n) => n.id !== node.id));
    clearSelection();
    const res = await fetch(`/api/fs/nodes/${node.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: true }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Restore failed");
      void load({ quiet: true });
      return;
    }
    notifyLibraryChange();
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
    setNodes((prev) =>
      prev.map((n) =>
        n.id === node.id ? { ...n, favorited: !n.favorited } : n,
      ),
    );
    notifyLibraryChange();
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

  const selectedIds = new Set(explorer.selectedIds ?? []);
  const isGrid = viewMode === "grid";

  function onItemDoubleClick(node: FsNode) {
    if (node.node_type === "folder" && !inTrash) {
      openFolder(node.id);
      return;
    }
    if (node.node_type === "file") openPreview(node);
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
          loading="lazy"
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
    if (!selectedIds.has(node.id)) applySelection([node.id], node.id);
    setCtxMenu({ x: e.clientX, y: e.clientY, node });
  }

  function openEmptyMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    clearSelection();
    setCtxMenu({ x: e.clientX, y: e.clientY, node: null });
  }

  function updateSort(key: ExplorerSortKey) {
    setSortPrefs((prev) => {
      const next =
        prev.key === key
          ? { ...prev, asc: !prev.asc }
          : { ...prev, key, asc: key === "date" || key === "size" ? false : true };
      writeExplorerSort(next);
      return next;
    });
  }

  function startMarquee(e: React.MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-fs-item]")) return;
    const root = canvasRef.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const x = e.clientX - rect.left + root.scrollLeft;
    const y = e.clientY - rect.top + root.scrollTop;
    setMarquee({ x0: x, y0: y, x1: x, y1: y });
    if (!e.metaKey && !e.ctrlKey && !e.shiftKey) clearSelection();

    function onMove(ev: MouseEvent) {
      const r = root!.getBoundingClientRect();
      setMarquee((m) =>
        m
          ? {
              ...m,
              x1: ev.clientX - r.left + root!.scrollLeft,
              y1: ev.clientY - r.top + root!.scrollTop,
            }
          : null,
      );
    }
    function onUp(ev: MouseEvent) {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const r = root!.getBoundingClientRect();
      const x1 = ev.clientX - r.left + root!.scrollLeft;
      const y1 = ev.clientY - r.top + root!.scrollTop;
      setMarquee((m) => {
        if (!m) return null;
        const left = Math.min(m.x0, x1);
        const top = Math.min(m.y0, y1);
        const right = Math.max(m.x0, x1);
        const bottom = Math.max(m.y0, y1);
        if (right - left < 4 && bottom - top < 4) return null;
        const hit: string[] = [];
        for (const [id, el] of itemElsRef.current) {
          const er = el.getBoundingClientRect();
          const elLeft = er.left - r.left + root!.scrollLeft;
          const elTop = er.top - r.top + root!.scrollTop;
          const elRight = elLeft + er.width;
          const elBottom = elTop + er.height;
          if (
            elLeft < right &&
            elRight > left &&
            elTop < bottom &&
            elBottom > top
          ) {
            hit.push(id);
          }
        }
        if (hit.length) applySelection(hit);
        return null;
      });
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
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
            setNewFolderTags("");
            setNewFolderDesc("");
          },
        },
        {
          id: "upload",
          label: "Upload",
          disabled: !editable || inTrash || !serverOnline,
          onSelect: () => fileInputRef.current?.click(),
        },
        {
          id: "select-all",
          label: "Select all",
          onSelect: () => applySelection(orderedIdsRef.current),
        },
        { id: "sep-r", label: "", separator: true },
        {
          id: "refresh",
          label: "Refresh",
          onSelect: () => void load({ quiet: true }),
        },
        ...(inTrash
          ? [
              { id: "sep-e", label: "", separator: true } as ExplorerMenuItem,
              {
                id: "empty",
                label: "Empty Recycle Bin",
                danger: true,
                disabled: nodes.length === 0,
                onSelect: () => setEmptyTrashOpen(true),
              } as ExplorerMenuItem,
            ]
          : []),
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
    if (node.node_type === "file") {
      items.push({
        id: "preview",
        label: "Preview",
        onSelect: () => openPreview(node),
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
    if (editable && !inTrash && selectedIds.size <= 1) {
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
    }
    return items;
  }

  const marqueeStyle = marquee
    ? {
        left: Math.min(marquee.x0, marquee.x1),
        top: Math.min(marquee.y0, marquee.y1),
        width: Math.abs(marquee.x1 - marquee.x0),
        height: Math.abs(marquee.y1 - marquee.y0),
      }
    : null;

  return (
    <div
      className="h-full min-h-0 flex flex-col"
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

      <div className="xp-toolbar-row">
        <input
          className="xp-search xp-filter-input"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter in this folder…"
          aria-label="Filter"
        />
        <div className="xp-toolbar-actions">
          <label className="xp-arrange-label">
            <span>Arrange</span>
            <select
              className="xp-arrange-select"
              value={`${sortPrefs.key}:${sortPrefs.asc ? "asc" : "desc"}`}
              aria-label="Arrange by"
              onChange={(e) => {
                const [key, dir] = e.target.value.split(":") as [
                  ExplorerSortKey,
                  "asc" | "desc",
                ];
                const next = {
                  ...sortPrefs,
                  key,
                  asc: dir === "asc",
                };
                setSortPrefs(next);
                writeExplorerSort(next);
              }}
            >
              <option value="name:asc">Name (A–Z)</option>
              <option value="name:desc">Name (Z–A)</option>
              <option value="date:desc">Date (newest)</option>
              <option value="date:asc">Date (oldest)</option>
              <option value="kind:asc">Kind (A–Z)</option>
              <option value="kind:desc">Kind (Z–A)</option>
              <option value="size:desc">Size (largest)</option>
              <option value="size:asc">Size (smallest)</option>
            </select>
          </label>
          <button
            type="button"
            className="xp-cmd"
            onClick={() => applySelection(orderedIdsRef.current)}
          >
            Select all
          </button>
          {inTrash ? (
            <button
              type="button"
              className="xp-cmd"
              disabled={nodes.length === 0}
              onClick={() => setEmptyTrashOpen(true)}
            >
              Empty Trash
            </button>
          ) : null}
        </div>
      </div>

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

      <div
        ref={canvasRef}
        className="xp-canvas relative flex-1 min-h-0 overflow-auto"
        onMouseDown={startMarquee}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("[data-fs-item]")) return;
          clearSelection();
        }}
      >
        {marqueeStyle ? (
          <div className="xp-marquee" style={marqueeStyle} />
        ) : null}

        {loading && nodes.length === 0 ? (
          <div className="xp-empty">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="xp-empty">
            {inTrash
              ? "Recycle Bin is empty."
              : filterText
                ? "No items match this filter."
                : "This folder is empty. Use New or Upload to add items."}
          </div>
        ) : isGrid ? (
          <div className="xp-grid">
            {displayed.map((node) => (
              <button
                key={node.id}
                type="button"
                data-fs-item={node.id}
                ref={(el) => {
                  if (el) itemElsRef.current.set(node.id, el);
                  else itemElsRef.current.delete(node.id);
                }}
                className={`xp-tile${selectedIds.has(node.id) ? " is-selected" : ""}`}
                onClick={(e) => onItemClick(e, node)}
                onDoubleClick={() => onItemDoubleClick(node)}
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
                <th style={{ width: "42%" }}>
                  <button type="button" className="xp-th-btn" onClick={() => updateSort("name")}>
                    Name
                  </button>
                </th>
                <th className="xp-col-date" style={{ width: "22%" }}>
                  <button type="button" className="xp-th-btn" onClick={() => updateSort("date")}>
                    Date modified
                  </button>
                </th>
                <th className="xp-col-type" style={{ width: "18%" }}>
                  <button type="button" className="xp-th-btn" onClick={() => updateSort("kind")}>
                    Type
                  </button>
                </th>
                <th className="xp-col-size" style={{ width: "12%" }}>
                  <button type="button" className="xp-th-btn" onClick={() => updateSort("size")}>
                    Size
                  </button>
                </th>
                <th style={{ width: "6%" }} />
              </tr>
            </thead>
            <tbody>
              {displayed.map((node) => (
                <tr
                  key={node.id}
                  data-fs-item={node.id}
                  ref={(el) => {
                    if (el) itemElsRef.current.set(node.id, el);
                    else itemElsRef.current.delete(node.id);
                  }}
                  className={`xp-row${selectedIds.has(node.id) ? " is-selected" : ""}`}
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
                    {formatBytes(node.size_bytes)}
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
      </div>

      {ctxMenu ? (
        <ExplorerContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxItems()}
          onClose={() => setCtxMenu(null)}
        />
      ) : null}

      {newFolderOpen ? (
        <Modal
          title="New folder"
          onClose={() => setNewFolderOpen(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setNewFolderOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void createFolder()}>
                Create
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-2">
            <input
              className="xp-search w-full"
              style={{ width: "100%" }}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void createFolder();
              }}
            />
            <input
              className="xp-search w-full"
              style={{ width: "100%" }}
              value={newFolderTags}
              onChange={(e) => setNewFolderTags(e.target.value)}
              placeholder="Tags (comma-separated)"
            />
            <textarea
              className="xp-details-textarea"
              rows={3}
              value={newFolderDesc}
              onChange={(e) => setNewFolderDesc(e.target.value)}
              placeholder="Description"
            />
          </div>
        </Modal>
      ) : null}

      {renameNode ? (
        <Modal
          title="Rename"
          onClose={() => setRenameNode(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRenameNode(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void saveRename()}>
                Save
              </Button>
            </>
          }
        >
          <input
            className="xp-search w-full"
            style={{ width: "100%" }}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveRename();
            }}
          />
        </Modal>
      ) : null}

      {trashTargets ? (
        <ConfirmModal
          title={inTrash ? "Delete permanently?" : "Move to Recycle Bin?"}
          message={
            inTrash
              ? `Permanently delete ${trashTargets.length} item${
                  trashTargets.length === 1 ? "" : "s"
                }. This cannot be undone.`
              : `Move ${trashTargets.length} item${
                  trashTargets.length === 1 ? "" : "s"
                } to Recycle Bin.`
          }
          confirmLabel={inTrash ? "Delete permanently" : "Move to trash"}
          danger
          onConfirm={() => void confirmTrash()}
          onClose={() => setTrashTargets(null)}
        />
      ) : null}

      {emptyTrashOpen ? (
        <ConfirmModal
          title="Empty Recycle Bin?"
          message="Permanently delete everything in Recycle Bin. This cannot be undone."
          confirmLabel="Empty Trash"
          danger
          onConfirm={() => void emptyTrash()}
          onClose={() => setEmptyTrashOpen(false)}
        />
      ) : null}
    </div>
  );
}
