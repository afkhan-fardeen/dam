"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AssetCard,
  FolderTile,
  type FolderMenuAction,
  type AssetMenuAction,
} from "@/components/AssetCard";
import { AssetDetail } from "@/components/AssetDetail";
import { useDriveChrome } from "@/components/DriveChrome";
import { ViewModeToggle } from "@/components/ViewModeToggle";
import { getTagChipStyles } from "@/lib/categories";
import { IconChevronRight, IconDots, IconInfoCircle, IconX } from "@tabler/icons-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { FolderMetaPanel } from "@/components/FolderMetaPanel";
import { MoveAssetModal } from "@/components/MoveAssetModal";
import { PasswordField } from "@/components/PasswordField";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { SelectionInspector } from "@/components/SelectionInspector";
import { VirtualPhotoGrid } from "@/components/VirtualPhotoGrid";
import { uploadFileWithProgress } from "@/lib/upload";
import { queueAssetDownload } from "@/lib/download";
import { writeLastPlace } from "@/lib/lastPlace";
import { readViewMode, writeViewMode, type ViewMode } from "@/lib/uiPrefs";
import {
  folderListCacheKey,
  getCachedFolderAssets,
  invalidateFolderAssetsCache,
  prefetchFolderAssets,
  setCachedFolderAssets,
} from "@/lib/folderAssetsCache";
import {
  canDownload,
  canEdit,
  type Asset,
  type Space,
  type SpaceRole,
  type Folder,
} from "@/lib/types";

type SpaceWorkspaceProps = {
  space: Space;
  role: SpaceRole | null;
  isAdmin: boolean;
  profileName: string;
};

type ModalKind =
  | null
  | "unlock"
  | "space_unlock"
  | "rename"
  | "move"
  | "passcode"
  | "confirm_clear"
  | "confirm_delete_folder"
  | "confirm_trash_asset"
  | "confirm_bulk_trash"
  | "bulk_move";

export function SpaceWorkspace({
  space,
  role,
  isAdmin,
  profileName,
}: SpaceWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    folderRequestId,
    serverOnline,
    upsertJob,
    removeJob,
    setPlaceNav,
    libraryEpoch,
  } = useDriveChrome();

  const editable = canEdit(role, isAdmin);
  const downloadable = canDownload(role, isAdmin);
  const [dragging, setDragging] = useState(false);
  const view = searchParams.get("view") || "all";
  const query = searchParams.get("q") || "";
  const folderFromUrl = searchParams.get("folder");
  const assetFromUrl = searchParams.get("asset");

  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(folderFromUrl);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [detailLaunch, setDetailLaunch] = useState<{
    panel: boolean;
    move: boolean;
  }>({ panel: false, move: false });
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [metaFolder, setMetaFolder] = useState<Folder | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const hasLoadedOnce = useRef(false);
  const loadGen = useRef(0);

  const [modal, setModal] = useState<ModalKind>(null);
  const [targetFolder, setTargetFolder] = useState<Folder | null>(null);
  const [passcodeInput, setPasscodeInput] = useState("");
  const [passcodeConfirm, setPasscodeConfirm] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [moveParentId, setMoveParentId] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalBusy, setModalBusy] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFolderId, setBulkFolderId] = useState<string | null>(null);
  const [spaceLocked, setSpaceLocked] = useState(false);
  const [bulkReview, setBulkReview] = useState<
    { id: string; name: string; open: boolean; description: string; tags: string[] }[]
  >([]);
  const [bulkTagDraft, setBulkTagDraft] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [pendingTrashAsset, setPendingTrashAsset] = useState<Asset | null>(null);
  const [renameAssetTarget, setRenameAssetTarget] = useState<Asset | null>(null);
  const [renameAssetValue, setRenameAssetValue] = useState("");
  const [moveAssetTarget, setMoveAssetTarget] = useState<Asset | null>(null);
  const [moveAssetBusy, setMoveAssetBusy] = useState(false);

  useEffect(() => {
    setViewMode(readViewMode());
  }, []);

  useEffect(() => {
    setFolderId(folderFromUrl);
  }, [folderFromUrl]);

  const folderRequestSeen = useRef(folderRequestId);
  useEffect(() => {
    // Only open when the shell bumps the counter — not when this page mounts
    // with a leftover id (was opening New folder on every Place click).
    if (folderRequestId === folderRequestSeen.current) return;
    folderRequestSeen.current = folderRequestId;
    if (folderRequestId > 0 && editable) setShowNewFolder(true);
  }, [folderRequestId, editable]);
  useEffect(() => {
    if (!showNewFolder) return;
    const t = window.setTimeout(() => newFolderInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [showNewFolder]);

  const loadFolders = useCallback(async () => {
    const res = await fetch(`/api/folders?space_id=${space.id}`);
    const json = await res.json();
    if (res.ok) setFolders(json.folders as Folder[]);
  }, [space.id]);

  const loadAssets = useCallback(async (opts?: { quiet?: boolean }) => {
    const cacheKey = folderListCacheKey(space.id, {
      folderId,
      view,
      query,
    });
    const quiet = Boolean(opts?.quiet || hasLoadedOnce.current);
    const cached = getCachedFolderAssets(cacheKey);

    if (cached) {
      setAssets(cached);
      setLoading(false);
      if (quiet) setRefreshing(true);
    } else if (!quiet) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError(null);
    const gen = ++loadGen.current;

    try {
      const params = new URLSearchParams({ space_id: space.id });
      if (query.trim()) {
        params.set("q", query.trim());
      } else if (view === "trash") {
        params.set("view", "trash");
      } else if (view === "recent") {
        params.set("view", "recent");
      } else if (view === "starred") {
        params.set("view", "starred");
      } else if (folderId) {
        params.set("folder_id", folderId);
      }
      const res = await fetch(`/api/search?${params.toString()}`);
      const json = await res.json();
      if (gen !== loadGen.current) return;

      if (!res.ok) {
        if (json.code === "SPACE_LOCKED") {
          setSpaceLocked(true);
          setPasscodeInput("");
          setModalError(null);
          setModal("space_unlock");
          setAssets([]);
          return;
        }
        if (json.code === "FOLDER_LOCKED" && folderId) {
          setTargetFolder({
            id: (json.folder_id as string) || folderId,
            space_id: space.id,
            parent_folder_id: null,
            name: "Locked folder",
            passcode_enabled: true,
            created_by: null,
            created_at: null,
          });
          setPasscodeInput("");
          setModalError(null);
          setModal("unlock");
          setAssets([]);
          return;
        }
        throw new Error(json.error || "Could not load files.");
      }
      setSpaceLocked(false);
      const next = (json.assets as Asset[]) ?? [];
      setCachedFolderAssets(cacheKey, next);
      setAssets(next);
      hasLoadedOnce.current = true;
    } catch (err) {
      if (gen !== loadGen.current) return;
      setError(err instanceof Error ? err.message : "Could not load files.");
      if (!cached) setAssets([]);
    } finally {
      if (gen === loadGen.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [space.id, folderId, query, view]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  // Enrich unlock modal with real folder name once folders load
  useEffect(() => {
    if (modal !== "unlock" || !targetFolder) return;
    const found = folders.find((f) => f.id === targetFolder.id);
    if (found && found.name !== targetFolder.name) {
      setTargetFolder(found);
    }
  }, [folders, modal, targetFolder]);

  useEffect(() => {
    const handle = window.setTimeout(
      () => void loadAssets({ quiet: hasLoadedOnce.current }),
      query ? 200 : 0,
    );
    return () => window.clearTimeout(handle);
  }, [loadAssets, query]);

  // Soft-reload when background uploads / library mutations finish
  const libraryEpochSeen = useRef(libraryEpoch);
  useEffect(() => {
    if (libraryEpoch === libraryEpochSeen.current) return;
    libraryEpochSeen.current = libraryEpoch;
    invalidateFolderAssetsCache(space.id);
    void loadAssets({ quiet: true });
    void loadFolders();
  }, [libraryEpoch, loadAssets, loadFolders, space.id]);

  useEffect(() => {
    if (!assetFromUrl || assets.length === 0) return;
    const found = assets.find((a) => a.id === assetFromUrl);
    if (found) setSelected(found);
  }, [assetFromUrl, assets]);

  const navigateFolder = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams();
      if (id) params.set("folder", id);
      const qs = params.toString();
      // Paint from cache immediately, then sync URL + folderId for the quiet fetch.
      const cacheKey = folderListCacheKey(space.id, {
        folderId: id,
        view: "all",
      });
      const cached = getCachedFolderAssets(cacheKey);
      if (cached) setAssets(cached);
      setFolderId(id);
      setSelectedIds(new Set());
      setSelectionMode(false);
      router.push(`/s/${space.slug}${qs ? `?${qs}` : ""}`);
      const folderName = id
        ? folders.find((f) => f.id === id)?.name ?? null
        : null;
      writeLastPlace({
        spaceSlug: space.slug,
        spaceName: space.name,
        folderId: id,
        folderName,
      });
    },
    [router, space.id, space.slug, space.name, folders],
  );

  const prefetchFolder = useCallback(
    (id: string | null) => {
      void prefetchFolderAssets(space.id, id);
    },
    [space.id],
  );

  useEffect(() => {
    setPlaceNav({
      spaceSlug: space.slug,
      spaceName: space.name,
      spaceId: space.id,
      folders,
      currentFolderId: folderId,
      onNavigateFolder: navigateFolder,
      onPrefetchFolder: prefetchFolder,
    });
    return () => setPlaceNav(null);
  }, [
    space.slug,
    space.name,
    space.id,
    folders,
    folderId,
    navigateFolder,
    prefetchFolder,
    setPlaceNav,
  ]);

  useEffect(() => {
    const folderName = folderId
      ? folders.find((f) => f.id === folderId)?.name ?? null
      : null;
    writeLastPlace({
      spaceSlug: space.slug,
      spaceName: space.name,
      folderId,
      folderName,
    });
  }, [space.slug, space.name, folderId, folders]);

  useEffect(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, [view, folderId, query]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAssetMenu(asset: Asset, action: AssetMenuAction) {
    if (action === "trash") {
      setPendingTrashAsset(asset);
      setModal("confirm_trash_asset");
      return;
    }
    if (action === "rename") {
      setRenameAssetTarget(asset);
      setRenameAssetValue(asset.original_name || "Untitled");
      return;
    }
    if (action === "move") {
      setMoveAssetTarget(asset);
      return;
    }
    setDetailLaunch({ panel: false, move: false });
    setSelected(asset);
  }

  async function toggleFavorite(asset: Asset) {
    const favorited = Boolean(asset.favorited);
    try {
      if (favorited) {
        const res = await fetch(
          `/api/favorites?asset_id=${encodeURIComponent(asset.id)}`,
          { method: "DELETE" },
        );
        if (!res.ok) return;
      } else {
        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ asset_id: asset.id }),
        });
        if (!res.ok) return;
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

  async function confirmRenameAsset(e: React.FormEvent) {
    e.preventDefault();
    if (!renameAssetTarget || !renameAssetValue.trim()) return;
    setModalBusy(true);
    try {
      const res = await fetch(`/api/assets/${renameAssetTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ original_name: renameAssetValue.trim() }),
      });
      const json = await res.json();
      if (res.ok && json.asset) {
        const updated = json.asset as Asset;
        setAssets((list) =>
          list.map((a) =>
            a.id === renameAssetTarget.id
              ? { ...updated, favorited: a.favorited }
              : a,
          ),
        );
        setSelected((cur) =>
          cur?.id === renameAssetTarget.id
            ? { ...updated, favorited: cur.favorited }
            : cur,
        );
      }
      setRenameAssetTarget(null);
    } finally {
      setModalBusy(false);
    }
  }

  async function confirmMoveAsset(folderId: string | null) {
    if (!moveAssetTarget) return;
    setMoveAssetBusy(true);
    try {
      const res = await fetch(`/api/assets/${moveAssetTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not move file.");
      setMoveAssetTarget(null);
      await loadAssets();
    } catch (err) {
      throw err instanceof Error ? err : new Error("Could not move file.");
    } finally {
      setMoveAssetBusy(false);
    }
  }

  async function confirmTrashAsset() {
    if (!pendingTrashAsset) return;
    setModalBusy(true);
    const asset = pendingTrashAsset;
    try {
      const res = await fetch(`/api/assets/${asset.id}`, { method: "DELETE" });
      if (res.ok) {
        setAssets((list) => list.filter((a) => a.id !== asset.id));
        if (selected?.id === asset.id) {
          setSelected(null);
          setDetailLaunch({ panel: false, move: false });
        }
      }
      setModal(null);
      setPendingTrashAsset(null);
    } finally {
      setModalBusy(false);
    }
  }

  async function bulkTrash() {
    if (selectedIds.size === 0) return;
    setModal("confirm_bulk_trash");
  }

  async function confirmBulkTrash() {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      for (const id of selectedIds) {
        const res = await fetch(`/api/assets/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Could not trash some files");
        }
      }
      setSelectedIds(new Set());
      setSelectionMode(false);
      setModal(null);
      await loadAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk trash failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkMove(e: React.FormEvent) {
    e.preventDefault();
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    setModalError(null);
    try {
      for (const id of selectedIds) {
        const res = await fetch(`/api/assets/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder_id: bulkFolderId }),
        });
        if (!res.ok) {
          const json = await res.json();
          throw new Error(json.error || "Could not move some files");
        }
      }
      setModal(null);
      setSelectedIds(new Set());
      setSelectionMode(false);
      await loadAssets();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Bulk move failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkZipDownload() {
    const picked = assets.filter((a) => selectedIds.has(a.id));
    if (picked.length === 0) return;
    if (picked.length > 50) {
      setError("Zip download is limited to 50 files at a time.");
      return;
    }
    if (!downloadable) {
      setError("You need download permission for zip export.");
      return;
    }
    setBulkBusy(true);
    setError(null);
    const jobId = `zip-${Date.now()}`;
    const zipName = `${space.slug}-files.zip`;
    upsertJob({
      id: jobId,
      name: zipName,
      progress: 0,
      kind: "download",
      status: "downloading",
    });
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (let i = 0; i < picked.length; i++) {
        const asset = picked[i];
        const res = await fetch(
          `/api/media/asset/${encodeURIComponent(asset.file_id)}`,
        );
        if (!res.ok) {
          throw new Error(`Could not download ${asset.original_name}`);
        }
        const blob = await res.blob();
        zip.file(asset.original_name || `${asset.id}`, blob);
        upsertJob({
          id: jobId,
          name: zipName,
          progress: Math.round(((i + 1) / (picked.length + 1)) * 90),
          kind: "download",
          status: "downloading",
        });
      }
      const out = await zip.generateAsync({ type: "blob" }, (meta) => {
        upsertJob({
          id: jobId,
          name: zipName,
          progress: 90 + Math.round(meta.percent * 0.09),
          kind: "download",
          status: "downloading",
        });
      });
      const url = URL.createObjectURL(out);
      const a = document.createElement("a");
      a.href = url;
      a.download = zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      upsertJob({
        id: jobId,
        name: zipName,
        progress: 100,
        kind: "download",
        status: "done",
      });
      window.setTimeout(() => removeJob(jobId), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zip download failed");
      upsertJob({
        id: jobId,
        name: zipName,
        progress: 0,
        kind: "download",
        status: "error",
        error: err instanceof Error ? err.message : "Zip download failed",
      });
    } finally {
      setBulkBusy(false);
    }
  }

  function tryOpenFolder(folder: Folder) {
    // Soft navigate — FOLDER_LOCKED from the quiet load opens the unlock modal.
    navigateFolder(folder.id);
  }

  const childFolders = useMemo(() => {
    if (query.trim() || view === "recent" || view === "trash") return [];
    return folders.filter((f) =>
      folderId ? f.parent_folder_id === folderId : f.parent_folder_id === null,
    );
  }, [folders, folderId, query, view]);

  const breadcrumb = useMemo(() => {
    const crumbs: { id: string | null; name: string }[] = [
      { id: null, name: space.name },
    ];
    if (!folderId || view !== "all" || query.trim()) return crumbs;
    const byId = new Map(folders.map((f) => [f.id, f]));
    const chain: Folder[] = [];
    let cur: Folder | undefined = byId.get(folderId);
    while (cur) {
      chain.unshift(cur);
      cur = cur.parent_folder_id ? byId.get(cur.parent_folder_id) : undefined;
    }
    for (const f of chain) crumbs.push({ id: f.id, name: f.name });
    return crumbs;
  }, [space.name, folderId, folders, view, query]);

  const moveTargets = useMemo(() => {
    if (!targetFolder) return [];
    return folders.filter((f) => f.id !== targetFolder.id);
  }, [folders, targetFolder]);

  const currentFolder = useMemo(
    () => (folderId ? folders.find((f) => f.id === folderId) ?? null : null),
    [folderId, folders],
  );

  const photosMode = viewMode === "photos";

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const res = await fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        space_id: space.id,
        parent_folder_id: folderId,
        name,
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not create folder.");
      return;
    }
    setNewFolderName("");
    setShowNewFolder(false);
    await loadFolders();
  }

  function openMenu(folder: Folder, action: FolderMenuAction) {
    setTargetFolder(folder);
    setModalError(null);
    setPasscodeInput("");
    setPasscodeConfirm("");
    if (action === "rename") {
      setRenameValue(folder.name);
      setModal("rename");
    } else if (action === "move") {
      setMoveParentId(folder.parent_folder_id);
      setModal("move");
    } else if (action === "set_passcode") {
      setModal("passcode");
    } else if (action === "clear_passcode") {
      setModal("confirm_clear");
    } else if (action === "delete") {
      void deleteFolder(folder);
    }
  }

  async function deleteFolder(folder: Folder) {
    setTargetFolder(folder);
    setModalError(null);
    setModal("confirm_delete_folder");
  }

  async function confirmDeleteFolder() {
    if (!targetFolder) return;
    setModalBusy(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/folders?id=${targetFolder.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        setModalError(json.error || "Could not delete folder.");
        return;
      }
      if (folderId === targetFolder.id) {
        navigateFolder(targetFolder.parent_folder_id);
      }
      setModal(null);
      setTargetFolder(null);
      await loadFolders();
    } finally {
      setModalBusy(false);
    }
  }

  async function submitUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!targetFolder) return;
    setModalBusy(true);
    setModalError(null);
    try {
      const res = await fetch("/api/folders/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folder_id: targetFolder.id,
          passcode: passcodeInput,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Incorrect passcode");
      setModal(null);
      navigateFolder(targetFolder.id);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setModalBusy(false);
    }
  }

  async function submitSpaceUnlock(e: React.FormEvent) {
    e.preventDefault();
    setModalBusy(true);
    setModalError(null);
    try {
      const res = await fetch("/api/spaces/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          space_id: space.id,
          passcode: passcodeInput,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Incorrect passcode");
      setModal(null);
      setSpaceLocked(false);
      await loadAssets();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Unlock failed");
    } finally {
      setModalBusy(false);
    }
  }

  async function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!targetFolder || !renameValue.trim()) return;
    setModalBusy(true);
    setModalError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: targetFolder.id, name: renameValue.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not rename");
      setModal(null);
      await loadFolders();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Could not rename");
    } finally {
      setModalBusy(false);
    }
  }

  async function submitMoveFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!targetFolder) return;
    setModalBusy(true);
    setModalError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: targetFolder.id,
          parent_folder_id: moveParentId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not move folder");
      setModal(null);
      await loadFolders();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Could not move");
    } finally {
      setModalBusy(false);
    }
  }

  async function submitPasscode(e: React.FormEvent) {
    e.preventDefault();
    if (!targetFolder) return;
    if (passcodeInput.length < 4) {
      setModalError("Passcode must be at least 4 characters");
      return;
    }
    if (passcodeInput !== passcodeConfirm) {
      setModalError("Passcodes do not match");
      return;
    }
    setModalBusy(true);
    setModalError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: targetFolder.id,
          passcode: passcodeInput,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not set passcode");
      setModal(null);
      await loadFolders();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Could not set passcode");
    } finally {
      setModalBusy(false);
    }
  }

  async function clearPasscode() {
    if (!targetFolder) return;
    setModalBusy(true);
    setModalError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: targetFolder.id,
          passcode_enabled: false,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not clear passcode");
      setModal(null);
      await loadFolders();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : "Could not clear");
    } finally {
      setModalBusy(false);
    }
  }

  const title =
    view === "trash"
      ? "Trash"
      : view === "recent"
        ? "Recent"
        : query.trim()
          ? "Search results"
          : null;

  async function uploadDroppedFiles(fileList: FileList | File[]) {
    if (!editable || !serverOnline) return;
    const files = Array.from(fileList);
    const uploaded: { id: string; name: string; open: boolean; description: string; tags: string[] }[] = [];
    for (const file of files) {
      const jobId = `${Date.now()}-${file.name}`;
      upsertJob({
        id: jobId,
        name: file.name,
        progress: 0,
        kind: "upload",
        status: "uploading",
      });
      try {
        const result = await uploadFileWithProgress({
          file,
          spaceId: space.id,
          folderId: folderId,
          createdBy: profileName || null,
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
        window.setTimeout(() => removeJob(jobId), 1500);
        if (result.id) {
          uploaded.push({
            id: result.id,
            name: file.name,
            open: false,
            description: "",
            tags: [],
          });
        }
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
    await loadAssets();
    if (uploaded.length > 0) setBulkReview(uploaded);
  }

  const inspectorAssets = useMemo(
    () => assets.filter((a) => selectedIds.has(a.id)),
    [assets, selectedIds],
  );

  return (
    <div
      className={`flex gap-0 w-full min-h-[60vh] relative ${
        dragging ? "outline outline-2 outline-dashed outline-[var(--accent)]" : ""
      }`}
      onDragEnter={(e) => {
        if (!editable || !serverOnline) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!editable || !serverOnline) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files?.length) {
          void uploadDroppedFiles(e.dataTransfer.files);
        }
      }}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-4 p-4 sm:p-5 relative">
      {dragging ? (
        <div
          className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center bg-base-100/70 type-label"
          style={{ color: space.color }}
        >
          Drop files to upload
        </div>
      ) : null}

      <div className="place-toolbar">
        <div className="place-toolbar-left min-w-0">
          {title ? (
            <h1 className="place-toolbar-title">{title}</h1>
          ) : (
            <nav className="place-crumbs" aria-label="Breadcrumb">
              {breadcrumb.map((crumb, i) => {
                const isLast = i === breadcrumb.length - 1;
                const hideMiddle =
                  breadcrumb.length > 4 && i > 0 && i < breadcrumb.length - 2;
                if (hideMiddle && i === 1) {
                  return (
                    <span key="ellipsis" className="place-crumb-sep-wrap">
                      <IconChevronRight
                        size={14}
                        className="place-crumb-sep"
                        aria-hidden
                      />
                      <span className="place-crumb place-crumb--muted">…</span>
                    </span>
                  );
                }
                if (hideMiddle) return null;
                return (
                  <span key={`${crumb.id ?? "root"}-${i}`} className="place-crumb-sep-wrap">
                    {i > 0 ? (
                      <IconChevronRight
                        size={14}
                        className="place-crumb-sep"
                        aria-hidden
                      />
                    ) : null}
                    {isLast ? (
                      <span
                        className="place-crumb place-crumb--current"
                        title={crumb.name}
                      >
                        {crumb.name}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="place-crumb"
                        style={i === 0 ? { color: space.color } : undefined}
                        onClick={() => navigateFolder(crumb.id)}
                        title={crumb.name}
                      >
                        {crumb.name}
                      </button>
                    )}
                  </span>
                );
              })}
              {currentFolder ? (
                <button
                  type="button"
                  className="place-crumb-info"
                  title="Folder details"
                  onClick={() => setMetaFolder(currentFolder)}
                >
                  <IconInfoCircle size={15} stroke={1.75} />
                </button>
              ) : null}
            </nav>
          )}
          {!serverOnline ? (
            <p className="place-toolbar-note">Server offline</p>
          ) : null}
        </div>
        <div className="place-toolbar-right">
          {editable && currentFolder && view === "all" && !query.trim() ? (
            <div className="dropdown dropdown-end">
              <div
                tabIndex={0}
                role="button"
                className="place-toolbar-ghost"
              >
                <IconDots size={16} />
                <span>Folder</span>
              </div>
              <ul
                tabIndex={0}
                className="dropdown-content menu bg-base-100 z-[9999] w-52 p-2 shadow-lg border border-base-300"
              >
                <li>
                  <button
                    type="button"
                    onClick={() => openMenu(currentFolder, "rename")}
                  >
                    Rename
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openMenu(currentFolder, "move")}
                  >
                    Move to…
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => openMenu(currentFolder, "set_passcode")}
                  >
                    {currentFolder.passcode_enabled
                      ? "Change passcode"
                      : "Set passcode"}
                  </button>
                </li>
                {currentFolder.passcode_enabled ? (
                  <li>
                    <button
                      type="button"
                      onClick={() => openMenu(currentFolder, "clear_passcode")}
                    >
                      Turn passcode off
                    </button>
                  </li>
                ) : null}
                <li>
                  <button
                    type="button"
                    className="text-error"
                    onClick={() => openMenu(currentFolder, "delete")}
                  >
                    Delete folder
                  </button>
                </li>
              </ul>
            </div>
          ) : null}
          {view !== "trash" ? (
            <ViewModeToggle
              value={viewMode}
              onChange={(mode) => {
                setViewMode(mode);
                writeViewMode(mode);
              }}
            />
          ) : null}
        </div>
      </div>

      {showNewFolder && editable ? (
        <Modal
          title="New folder"
          onClose={() => {
            setShowNewFolder(false);
            setNewFolderName("");
          }}
          onSubmit={(e) => {
            e.preventDefault();
            void createFolder();
          }}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName("");
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={!newFolderName.trim()}
              >
                Create folder
              </Button>
            </>
          }
        >
          <label className="flat-modal-field">
            <span className="flat-modal-label">Name</span>
            <input
              ref={newFolderInputRef}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="flat-input"
            />
          </label>
        </Modal>
      ) : null}

      {error ? (
        <p className="type-caption text-error">{error}</p>
      ) : null}

      {view !== "trash" && assets.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setSelectionMode((v) => !v);
              setSelectedIds(new Set());
            }}
          >
            {selectionMode ? "Cancel select" : "Select"}
          </button>
          {selectionMode && selectedIds.size > 0 ? (
            <div className="bulk-bar flex flex-wrap items-center gap-2 w-full">
              <span className="type-caption">
                {selectedIds.size} selected
              </span>
              {editable ? (
                <>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    className="btn-flat !h-8 px-3 text-[12px]"
                    onClick={() => {
                      setBulkFolderId(folderId);
                      setModalError(null);
                      setModal("bulk_move");
                    }}
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    className="btn-flat-danger !h-8 px-3 text-[12px]"
                    onClick={() => void bulkTrash()}
                  >
                    Trash
                  </button>
                </>
              ) : null}
              {downloadable ? (
                <button
                  type="button"
                  disabled={bulkBusy}
                  className="btn-flat !h-8 px-3 text-[12px]"
                  onClick={() => void bulkZipDownload()}
                >
                  {bulkBusy ? "Preparing…" : "Download zip"}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {bulkReview.length > 0 ? (
        <div className="card bg-base-100 border border-base-300 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="type-title">
              Uploaded {bulkReview.length} file
              {bulkReview.length === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setBulkReview([])}
            >
              Dismiss
            </button>
          </div>
          {bulkReview.map((row) => (
            <div
              key={row.id}
              className="flex flex-col gap-2 border-t border-base-300 pt-3 first:border-0 first:pt-0"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="type-label truncate">
                  {row.name}
                </p>
                <button
                  type="button"
                  className="type-caption text-primary"
                  onClick={() =>
                    setBulkReview((list) =>
                      list.map((r) =>
                        r.id === row.id ? { ...r, open: !r.open } : r,
                      ),
                    )
                  }
                >
                  {row.open ? "Hide details" : "Add details"}
                </button>
              </div>
              {row.open ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={row.description}
                    onChange={(e) =>
                      setBulkReview((list) =>
                        list.map((r) =>
                          r.id === row.id
                            ? { ...r, description: e.target.value }
                            : r,
                        ),
                      )
                    }
                    placeholder="Description"
                    className="input input-bordered"
                  />
                  <div className="flex flex-wrap gap-1">
                    {row.tags.map((t) => {
                      const chip = getTagChipStyles(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          style={chip.style}
                          className="badge gap-1"
                          onClick={() =>
                            setBulkReview((list) =>
                              list.map((r) =>
                                r.id === row.id
                                  ? {
                                      ...r,
                                      tags: r.tags.filter((x) => x !== t),
                                    }
                                  : r,
                              ),
                            )
                          }
                        >
                          {t}
                          <IconX size={10} />
                        </button>
                      );
                    })}
                  </div>
                  <input
                    value={bulkTagDraft[row.id] || ""}
                    onChange={(e) =>
                      setBulkTagDraft((m) => ({
                        ...m,
                        [row.id]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const name = (bulkTagDraft[row.id] || "").trim();
                      if (!name) return;
                      setBulkReview((list) =>
                        list.map((r) =>
                          r.id === row.id && !r.tags.includes(name)
                            ? { ...r, tags: [...r.tags, name] }
                            : r,
                        ),
                      );
                      setBulkTagDraft((m) => ({ ...m, [row.id]: "" }));
                    }}
                    placeholder="Tag + Enter"
                    className="input input-bordered"
                  />
                  <button
                    type="button"
                    className="btn btn-primary self-start"
                    onClick={() => {
                      void (async () => {
                        const draft = (bulkTagDraft[row.id] || "").trim();
                        const tagsToSave =
                          draft &&
                          !row.tags.some(
                            (t) => t.toLowerCase() === draft.toLowerCase(),
                          )
                            ? [...row.tags, draft]
                            : row.tags;
                        const res = await fetch(`/api/assets/${row.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            description: row.description,
                            addTags: tagsToSave,
                          }),
                        });
                        if (!res.ok) {
                          const json = await res.json();
                          setError(json.error || "Could not save tags.");
                          return;
                        }
                        setBulkReview((list) =>
                          list.filter((r) => r.id !== row.id),
                        );
                        setBulkTagDraft((m) => {
                          const next = { ...m };
                          delete next[row.id];
                          return next;
                        });
                        await loadAssets();
                      })();
                    }}
                  >
                    Save
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {spaceLocked ? (
        <p className="type-body opacity-60 py-6">
          This space is locked. Enter the passcode to continue.
        </p>
      ) : null}

      <div
        className={`flex flex-col gap-4 transition-opacity duration-150${
          refreshing ? " opacity-80" : ""
        }`}
      >
        {refreshing ? (
          <div
            className="h-0.5 w-full overflow-hidden rounded-full bg-[var(--line)]"
            aria-hidden
          >
            <div className="folder-refresh-bar h-full w-1/3 rounded-full bg-[var(--accent)]" />
          </div>
        ) : null}
        {childFolders.length > 0 ? (
          <section>
            <h2 className="type-micro opacity-50 mb-2">Folders</h2>
            <div className="flex flex-col gap-0.5 sm:grid sm:grid-cols-2 sm:gap-0.5">
              {childFolders.map((folder) => (
                <div
                  key={folder.id}
                  className="relative group/folder"
                  onMouseEnter={() => prefetchFolder(folder.id)}
                  onFocus={() => prefetchFolder(folder.id)}
                  onDragOver={(e) => {
                    if (!editable || !serverOnline) return;
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    if (!editable || !serverOnline) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDragging(false);
                    if (e.dataTransfer.files?.length) {
                      navigateFolder(folder.id);
                      window.setTimeout(() => {
                        void uploadDroppedFiles(e.dataTransfer.files);
                      }, 50);
                    }
                  }}
                >
                  <FolderTile
                    name={folder.name}
                    color={space.color}
                    locked={Boolean(folder.passcode_enabled)}
                    canEdit={editable}
                    onOpen={() => tryOpenFolder(folder)}
                    onMenuAction={(action) => openMenu(folder, action)}
                  />
                  <button
                    type="button"
                    className="absolute top-2 right-10 dock-btn !px-1.5 opacity-0 group-hover/folder:opacity-100 transition-opacity"
                    title="Folder details"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMetaFolder(folder);
                    }}
                  >
                    <IconInfoCircle size={14} stroke={1.75} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h2 className="type-micro opacity-50 mb-2">
            {view === "trash"
              ? "Recently Deleted"
              : photosMode
                ? "Photos"
                : "Files"}
            {!loading ? ` · ${assets.length}` : ""}
          </h2>
          {loading ? (
            <Skeleton rows={4} />
          ) : assets.length === 0 ? (
            <div className="surface empty-state">
              <p className="type-title">
                {view === "trash" ? "Recently Deleted" : "Empty"}
              </p>
              <p className="type-caption mt-2">
                {view === "trash"
                  ? "Trash is empty."
                  : editable
                    ? "Drop files here or use Upload in the dock."
                    : "Nothing here yet."}
              </p>
            </div>
          ) : photosMode ? (
            <VirtualPhotoGrid
              items={assets}
              cellSize={116}
              gap={4}
              getKey={(a) => a.id}
              renderItem={(asset) => (
                <AssetCard
                  asset={asset}
                  layout="grid"
                  thumbnailUrl={
                    asset.has_thumbnail
                      ? `/api/media/thumbnail/${encodeURIComponent(asset.file_id)}`
                      : null
                  }
                  selected={selectedIds.has(asset.id)}
                  selectionMode={selectionMode}
                  onToggleSelect={() => toggleSelect(asset.id)}
                  onToggleFavorite={
                    view === "trash"
                      ? undefined
                      : () => void toggleFavorite(asset)
                  }
                  onClick={() => {
                    setDetailLaunch({ panel: false, move: false });
                    setSelected(asset);
                  }}
                  canDownload={downloadable && view !== "trash"}
                  canEdit={editable && view !== "trash"}
                  onDownload={
                    downloadable && view !== "trash"
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
                    editable && view !== "trash"
                      ? (action) => void handleAssetMenu(asset, action)
                      : undefined
                  }
                />
              )}
            />
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
                  {selectionMode ? <span className="w-5 shrink-0" /> : null}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="w-8 shrink-0" />
                    <span className="flex-1 min-w-0">Name</span>
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
              {assets.map((asset) => (
                <AssetCard
                  key={asset.id}
                  asset={asset}
                  layout={viewMode === "list" ? "list" : "grid"}
                  thumbnailUrl={
                    asset.has_thumbnail
                      ? `/api/media/thumbnail/${encodeURIComponent(asset.file_id)}`
                      : null
                  }
                  selected={selectedIds.has(asset.id)}
                  selectionMode={selectionMode}
                  onToggleSelect={() => toggleSelect(asset.id)}
                  onToggleFavorite={
                    view === "trash"
                      ? undefined
                      : () => void toggleFavorite(asset)
                  }
                  onClick={() => {
                    setDetailLaunch({ panel: false, move: false });
                    setSelected(asset);
                  }}
                  canDownload={downloadable && view !== "trash"}
                  canEdit={editable && view !== "trash"}
                  onDownload={
                    downloadable && view !== "trash"
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
                    editable && view !== "trash"
                      ? (action) => void handleAssetMenu(asset, action)
                      : undefined
                  }
                />
              ))}
            </div>
          )}
        </section>
      </div>

      </div>

      {inspectorAssets.length > 0 && view !== "trash" && !selected ? (
        <SelectionInspector
          assets={inspectorAssets}
          folder={null}
          spaceName={space.name}
          onClear={() => {
            setSelectedIds(new Set());
            setSelectionMode(false);
          }}
          onOpenAsset={(a) => {
            setDetailLaunch({ panel: true, move: false });
            setSelected(a);
          }}
        />
      ) : null}

      {selected ? (
        <AssetDetail
          asset={selected}
          assets={assets}
          onNavigateAsset={(a) => {
            setDetailLaunch({ panel: false, move: false });
            setSelected(a);
          }}
          folders={folders}
          canDownload={downloadable && view !== "trash"}
          canDelete={editable && view !== "trash"}
          canMove={editable && view !== "trash"}
          canRename={editable && view !== "trash"}
          canEditDetails={editable && view !== "trash"}
          trashMode={view === "trash"}
          canRestore={editable && view === "trash"}
          initialPanelOpen={detailLaunch.panel}
          initialShowMove={detailLaunch.move}
          onClose={() => {
            setSelected(null);
            setDetailLaunch({ panel: false, move: false });
          }}
          onDeleted={() => {
            setSelected(null);
            setDetailLaunch({ panel: false, move: false });
            void loadAssets();
          }}
          onRestored={() => {
            setSelected(null);
            setDetailLaunch({ panel: false, move: false });
            void loadAssets();
          }}
          onMoved={() => {
            setSelected(null);
            setDetailLaunch({ panel: false, move: false });
            void loadAssets();
          }}
          onRenamed={(updated) => {
            setSelected({ ...selected, ...updated, favorited: selected.favorited });
            void loadAssets();
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

      {modal === "unlock" && targetFolder ? (
        <Modal
          title={`Unlock “${targetFolder.name}”`}
          description="Enter the folder passcode. Access lasts 8 hours."
          onClose={() => setModal(null)}
          closeDisabled={modalBusy}
          onSubmit={submitUnlock}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={modalBusy}
                onClick={() => setModal(null)}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={modalBusy}>
                {modalBusy ? "Unlocking…" : "Unlock folder"}
              </Button>
            </>
          }
        >
          <PasswordField
            autoFocus
            value={passcodeInput}
            onChange={setPasscodeInput}
            placeholder="Passcode"
            autoComplete="current-password"
          />
          {modalError ? <p className="flat-modal-error">{modalError}</p> : null}
        </Modal>
      ) : null}

      {modal === "space_unlock" ? (
        <Modal
          title={`Unlock “${space.name}”`}
          description="Enter the place passcode. Access lasts 8 hours."
          onClose={() => setModal(null)}
          closeDisabled={modalBusy}
          onSubmit={submitSpaceUnlock}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={modalBusy}
                onClick={() => setModal(null)}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={modalBusy}>
                {modalBusy ? "Unlocking…" : "Unlock place"}
              </Button>
            </>
          }
        >
          <PasswordField
            autoFocus
            value={passcodeInput}
            onChange={setPasscodeInput}
            placeholder="Passcode"
            autoComplete="current-password"
          />
          {modalError ? <p className="flat-modal-error">{modalError}</p> : null}
        </Modal>
      ) : null}

      {modal === "bulk_move" ? (
        <Modal
          title="Move files"
          description={`Move ${selectedIds.size} selected file${selectedIds.size === 1 ? "" : "s"}`}
          onClose={() => setModal(null)}
          closeDisabled={bulkBusy}
          onSubmit={bulkMove}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={bulkBusy}
                onClick={() => setModal(null)}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={bulkBusy}>
                {bulkBusy ? "Moving…" : "Move here"}
              </Button>
            </>
          }
        >
          <label className="flat-modal-field">
            <span className="flat-modal-label">Destination</span>
            <select
              value={bulkFolderId ?? ""}
              onChange={(e) =>
                setBulkFolderId(e.target.value ? e.target.value : null)
              }
              className="flat-input"
            >
              <option value="">Place root</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          {modalError ? <p className="flat-modal-error">{modalError}</p> : null}
        </Modal>
      ) : null}

      {modal === "rename" && targetFolder ? (
        <Modal
          title="Rename folder"
          onClose={() => setModal(null)}
          closeDisabled={modalBusy}
          onSubmit={submitRename}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={modalBusy}
                onClick={() => setModal(null)}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={modalBusy}>
                {modalBusy ? "Saving…" : "Rename"}
              </Button>
            </>
          }
        >
          <label className="flat-modal-field">
            <span className="flat-modal-label">Name</span>
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="flat-input"
            />
          </label>
          {modalError ? <p className="flat-modal-error">{modalError}</p> : null}
        </Modal>
      ) : null}

      {modal === "move" && targetFolder ? (
        <Modal
          title="Move folder"
          description={`Move “${targetFolder.name}”`}
          onClose={() => setModal(null)}
          closeDisabled={modalBusy}
          onSubmit={submitMoveFolder}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={modalBusy}
                onClick={() => setModal(null)}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={modalBusy}>
                {modalBusy ? "Moving…" : "Move here"}
              </Button>
            </>
          }
        >
          <label className="flat-modal-field">
            <span className="flat-modal-label">Destination</span>
            <select
              value={moveParentId ?? ""}
              onChange={(e) =>
                setMoveParentId(e.target.value ? e.target.value : null)
              }
              className="flat-input"
            >
              <option value="">Place root</option>
              {moveTargets.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          {modalError ? <p className="flat-modal-error">{modalError}</p> : null}
        </Modal>
      ) : null}

      {modal === "passcode" && targetFolder ? (
        <Modal
          title={
            targetFolder.passcode_enabled ? "Change passcode" : "Set passcode"
          }
          description={`For “${targetFolder.name}”`}
          onClose={() => setModal(null)}
          closeDisabled={modalBusy}
          onSubmit={submitPasscode}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={modalBusy}
                onClick={() => setModal(null)}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={modalBusy}>
                {modalBusy ? "Saving…" : "Save passcode"}
              </Button>
            </>
          }
        >
          <PasswordField
            autoFocus
            value={passcodeInput}
            onChange={setPasscodeInput}
            placeholder="New passcode"
            autoComplete="new-password"
          />
          <PasswordField
            value={passcodeConfirm}
            onChange={setPasscodeConfirm}
            placeholder="Confirm passcode"
            autoComplete="new-password"
          />
          {modalError ? <p className="flat-modal-error">{modalError}</p> : null}
        </Modal>
      ) : null}

      {modal === "confirm_clear" && targetFolder ? (
        <Modal
          title="Turn passcode off"
          description={`Anyone with access to ${space.name} will be able to open “${targetFolder.name}” without a passcode.`}
          onClose={() => setModal(null)}
          closeDisabled={modalBusy}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={modalBusy}
                onClick={() => setModal(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={modalBusy}
                onClick={() => void clearPasscode()}
              >
                {modalBusy ? "Working…" : "Turn off passcode"}
              </Button>
            </>
          }
        >
          {modalError ? <p className="flat-modal-error">{modalError}</p> : null}
        </Modal>
      ) : null}

      {modal === "confirm_delete_folder" && targetFolder ? (
        <ConfirmModal
          title="Delete folder"
          message={`Delete “${targetFolder.name}”? The folder must be empty.`}
          confirmLabel="Delete"
          danger
          busy={modalBusy}
          onClose={() => {
            setModal(null);
            setTargetFolder(null);
          }}
          onConfirm={() => void confirmDeleteFolder()}
        />
      ) : null}

      {modal === "confirm_trash_asset" && pendingTrashAsset ? (
        <ConfirmModal
          title="Move to trash"
          message={`Move “${pendingTrashAsset.original_name || "this file"}” to trash?`}
          confirmLabel="Move to trash"
          danger
          busy={modalBusy}
          onClose={() => {
            setModal(null);
            setPendingTrashAsset(null);
          }}
          onConfirm={() => void confirmTrashAsset()}
        />
      ) : null}

      {modal === "confirm_bulk_trash" ? (
        <ConfirmModal
          title="Move to trash"
          message={`Move ${selectedIds.size} file(s) to trash?`}
          confirmLabel="Move to trash"
          danger
          busy={bulkBusy}
          onClose={() => setModal(null)}
          onConfirm={() => void confirmBulkTrash()}
        />
      ) : null}

      {renameAssetTarget ? (
        <Modal
          title="Rename file"
          onClose={() => setRenameAssetTarget(null)}
          closeDisabled={modalBusy}
          onSubmit={confirmRenameAsset}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={modalBusy}
                onClick={() => setRenameAssetTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={modalBusy || !renameAssetValue.trim()}
              >
                {modalBusy ? "Saving…" : "Rename"}
              </Button>
            </>
          }
        >
          <label className="flat-modal-field">
            <span className="flat-modal-label">Name</span>
            <input
              autoFocus
              value={renameAssetValue}
              onChange={(e) => setRenameAssetValue(e.target.value)}
              className="flat-input"
            />
          </label>
        </Modal>
      ) : null}

      {moveAssetTarget ? (
        <MoveAssetModal
          assetName={moveAssetTarget.original_name || "Untitled"}
          spaceId={space.id}
          currentFolderId={moveAssetTarget.folder_id}
          folders={folders}
          busy={moveAssetBusy}
          onClose={() => setMoveAssetTarget(null)}
          onMove={confirmMoveAsset}
        />
      ) : null}

      {metaFolder ? (
        <FolderMetaPanel
          folder={metaFolder}
          editable={editable}
          onClose={() => setMetaFolder(null)}
          onSaved={(updated) => {
            setFolders((list) =>
              list.map((f) => (f.id === updated.id ? { ...f, ...updated } : f)),
            );
            setMetaFolder(updated);
          }}
        />
      ) : null}
    </div>
  );
}
