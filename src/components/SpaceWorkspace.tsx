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
import { FilterChips } from "@/components/FilterChips";
import { useDriveChrome } from "@/components/DriveChrome";
import { ViewModeToggle } from "@/components/ViewModeToggle";
import { ROLE_LABELS, getTagChipStyles } from "@/lib/categories";
import { IconDots, IconX } from "@tabler/icons-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { MoveAssetModal } from "@/components/MoveAssetModal";
import { PasswordField } from "@/components/PasswordField";
import { GlassSkeleton } from "@/components/glass/GlassSkeleton";
import { uploadFileWithProgress } from "@/lib/upload";
import { queueAssetDownload } from "@/lib/download";
import { readViewMode, writeViewMode, type ViewMode } from "@/lib/uiPrefs";
import {
  canDownload,
  canEdit,
  type Asset,
  type Space,
  type SpaceRole,
  type Folder,
  type Tag,
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
  const { folderRequestId, serverOnline, upsertJob, removeJob } =
    useDriveChrome();

  const editable = canEdit(role, isAdmin);
  const downloadable = canDownload(role, isAdmin);
  const [dragging, setDragging] = useState(false);
  const view = searchParams.get("view") || "all";
  const query = searchParams.get("q") || "";
  const folderFromUrl = searchParams.get("folder");
  const assetFromUrl = searchParams.get("asset");

  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(folderFromUrl);
  const [tag, setTag] = useState<string | null>(null);
  const [tagOptions, setTagOptions] = useState<string[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [detailLaunch, setDetailLaunch] = useState<{
    panel: boolean;
    move: boolean;
  }>({ panel: false, move: false });
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [fadeKey, setFadeKey] = useState(0);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
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

  const loadAssets = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      if (tag && view !== "trash") params.set("tag", tag);

      const res = await fetch(`/api/search?${params.toString()}`);
      const json = await res.json();
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
      setAssets(json.assets as Asset[]);
      setFadeKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load files.");
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, [space.id, folderId, query, tag, view]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  const reloadTagOptions = useCallback(async () => {
    const res = await fetch("/api/tags");
    const json = await res.json();
    if (res.ok) {
      setTagOptions(((json.tags as Tag[]) ?? []).map((t) => t.name));
    }
  }, []);

  useEffect(() => {
    void reloadTagOptions();
  }, [reloadTagOptions]);

  // Keep filter chips in sync when new tags are created during this session
  useEffect(() => {
    const fromAssets = new Set<string>();
    for (const a of assets) {
      for (const t of a.tags ?? []) fromAssets.add(t.name);
    }
    if (fromAssets.size === 0) return;
    setTagOptions((prev) => {
      const merged = new Set([...prev, ...fromAssets]);
      return [...merged].sort((a, b) => a.localeCompare(b));
    });
  }, [assets]);

  // Enrich unlock modal with real folder name once folders load
  useEffect(() => {
    if (modal !== "unlock" || !targetFolder) return;
    const found = folders.find((f) => f.id === targetFolder.id);
    if (found && found.name !== targetFolder.name) {
      setTargetFolder(found);
    }
  }, [folders, modal, targetFolder]);

  useEffect(() => {
    const handle = window.setTimeout(() => void loadAssets(), query ? 200 : 0);
    return () => window.clearTimeout(handle);
  }, [loadAssets, query]);

  useEffect(() => {
    if (!assetFromUrl || assets.length === 0) return;
    const found = assets.find((a) => a.id === assetFromUrl);
    if (found) setSelected(found);
  }, [assetFromUrl, assets]);

  function navigateFolder(id: string | null) {
    const params = new URLSearchParams();
    if (id) params.set("folder", id);
    const qs = params.toString();
    router.push(`/s/${space.slug}${qs ? `?${qs}` : ""}`);
    setFolderId(id);
    setSelectedIds(new Set());
    setSelectionMode(false);
  }

  useEffect(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, [view, folderId, query, tag]);

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

  async function tryOpenFolder(folder: Folder) {
    if (!folder.passcode_enabled) {
      navigateFolder(folder.id);
      return;
    }
    // Probe access — if locked, API returns FOLDER_LOCKED
    const params = new URLSearchParams({
      space_id: space.id,
      folder_id: folder.id,
    });
    const res = await fetch(`/api/search?${params}`);
    const json = await res.json();
    if (res.ok) {
      navigateFolder(folder.id);
      return;
    }
    if (json.code === "FOLDER_LOCKED") {
      setTargetFolder(folder);
      setPasscodeInput("");
      setModalError(null);
      setModal("unlock");
      return;
    }
    setError(json.error || "Could not open folder.");
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

  return (
    <div
      className={`flex flex-col gap-4 p-4 sm:p-5 w-full min-h-[60vh] relative ${
        dragging ? "outline outline-2 outline-dashed" : ""
      }`}
      style={dragging ? { outlineColor: space.color } : undefined}
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
      {dragging ? (
        <div
          className="pointer-events-none absolute inset-3 z-10 flex items-center justify-center bg-base-100/70 type-label"
          style={{ color: space.color }}
        >
          Drop files to upload
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          {title ? (
            <h1 className="type-page truncate">
              {title}
            </h1>
          ) : (
            <>
              {breadcrumb.length > 1 ? (
                <nav
                  aria-label="Breadcrumb"
                  className="breadcrumbs type-caption p-0 mb-1 max-w-full opacity-60"
                >
                  <ul className="flex-wrap">
                    {breadcrumb.slice(0, -1).map((crumb, i, ancestors) => {
                      const hideMiddle =
                        ancestors.length > 2 && i > 0 && i < ancestors.length - 1;
                      if (hideMiddle && i === 1) {
                        return (
                          <li key="ellipsis">
                            <span className="opacity-50">…</span>
                          </li>
                        );
                      }
                      if (hideMiddle) return null;
                      return (
                        <li key={`${crumb.id ?? "root"}-${i}`}>
                          <button
                            type="button"
                            onClick={() => navigateFolder(crumb.id)}
                            className="hover:text-primary max-w-[10rem] truncate"
                            style={i === 0 ? { color: space.color } : undefined}
                          >
                            {crumb.name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              ) : null}
              <h1
                className="type-page truncate"
                style={
                  breadcrumb.length === 1 ? { color: space.color } : undefined
                }
              >
                {breadcrumb[breadcrumb.length - 1]?.name ?? space.name}
              </h1>
            </>
          )}
          <p className="type-caption opacity-50 mt-1">
            {ROLE_LABELS[role || "viewer"] || "Viewer"}
            {!serverOnline ? " · Server offline" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {editable && currentFolder && view === "all" && !query.trim() ? (
            <div className="dropdown dropdown-end">
              <div
                tabIndex={0}
                role="button"
                className="btn btn-ghost btn-sm gap-1.5"
              >
                <IconDots size={16} />
                Folder
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

      {view !== "trash" && !query.trim() && tagOptions.length > 0 ? (
        <FilterChips
          label="Tag"
          options={tagOptions}
          value={tag}
          onChange={setTag}
        />
      ) : null}

      {showNewFolder && editable ? (
        <dialog
          className="modal modal-open"
          onCancel={(e) => {
            e.preventDefault();
            setShowNewFolder(false);
            setNewFolderName("");
          }}
        >
          <div className="glass-scrim absolute inset-0 pointer-events-none" />
          <form
            className="modal-box max-w-sm p-0 glass-content glass-appear !bg-[var(--content-glass)] border-0 shadow-none"
            style={{ borderRadius: 22 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              void createFolder();
            }}
          >
            <div className="flex items-center gap-2 px-5 pt-5 pb-2">
              <h3 className="type-title flex-1">New folder</h3>
              <button
                type="button"
                aria-label="Close"
                className="dock-btn !px-2"
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName("");
                }}
              >
                <IconX size={16} />
              </button>
            </div>
            <div className="px-5 py-3">
              <label className="flex flex-col gap-1.5">
                <span className="type-caption">Name</span>
                <input
                  ref={newFolderInputRef}
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  className="glass-input w-full type-body px-3 py-2 rounded-[12px] bg-white/55"
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4">
              <button
                type="button"
                className="btn-glass"
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName("");
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-glass-primary"
                disabled={!newFolderName.trim()}
              >
                Create
              </button>
            </div>
          </form>
          <form method="dialog" className="modal-backdrop bg-transparent">
            <button
              type="button"
              onClick={() => {
                setShowNewFolder(false);
                setNewFolderName("");
              }}
            >
              close
            </button>
          </form>
        </dialog>
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
            <>
              <span className="type-caption opacity-60">
                {selectedIds.size} selected
              </span>
              {editable ? (
                <>
                  <button
                    type="button"
                    disabled={bulkBusy}
                    className="btn btn-ghost btn-sm"
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
                    className="btn btn-ghost btn-sm"
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
                  className="btn btn-ghost btn-sm"
                  onClick={() => void bulkZipDownload()}
                >
                  {bulkBusy ? "Preparing…" : "Download zip"}
                </button>
              ) : null}
            </>
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
                        await reloadTagOptions();
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

      <div key={fadeKey} className="flex flex-col gap-4 transition-opacity duration-150">
        {childFolders.length > 0 ? (
          <section>
            <h2 className="type-micro opacity-50 mb-2">Folders</h2>
            <div className="flex flex-col gap-0.5 sm:grid sm:grid-cols-2 sm:gap-0.5">
              {childFolders.map((folder) => (
                <FolderTile
                  key={folder.id}
                  name={folder.name}
                  color={space.color}
                  locked={Boolean(folder.passcode_enabled)}
                  canEdit={editable}
                  onOpen={() => void tryOpenFolder(folder)}
                  onMenuAction={(action) => openMenu(folder, action)}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section>
          <h2 className="type-micro opacity-50 mb-2">
            {view === "trash"
              ? "Deleted files"
              : "Files"}
            {!loading ? ` · ${assets.length}` : ""}
          </h2>
          {loading ? (
            <GlassSkeleton rows={4} />
          ) : assets.length === 0 ? (
            <p className="type-body opacity-60 py-8">
              {view === "trash"
                ? "Trash is empty."
                : editable
                  ? "Nothing here yet. Drop files here or use Upload in the dock."
                  : "Nothing here yet."}
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
                  layout={viewMode}
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

      {selected ? (
        <AssetDetail
          key={`${selected.id}-${detailLaunch.move ? "move" : "view"}`}
          asset={selected}
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
        <ModalShell title={`Unlock “${targetFolder.name}”`} onClose={() => setModal(null)}>
          <form onSubmit={submitUnlock} className="flex flex-col gap-3">
            <p className="type-body opacity-60">
              Enter the folder passcode. Access lasts 8 hours.
            </p>
            <PasswordField
              autoFocus
              value={passcodeInput}
              onChange={setPasscodeInput}
              placeholder="Passcode"
              autoComplete="current-password"
            />
            {modalError ? (
              <p className="type-caption text-error">{modalError}</p>
            ) : null}
            <div className="modal-action mt-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={modalBusy}
                className="btn btn-primary"
              >
                Unlock
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {modal === "space_unlock" ? (
        <ModalShell title={`Unlock “${space.name}”`} onClose={() => setModal(null)}>
          <form onSubmit={submitSpaceUnlock} className="flex flex-col gap-3">
            <p className="type-body opacity-60">
              Enter the space passcode. Access lasts 8 hours.
            </p>
            <PasswordField
              autoFocus
              value={passcodeInput}
              onChange={setPasscodeInput}
              placeholder="Passcode"
              autoComplete="current-password"
            />
            {modalError ? (
              <p className="type-caption text-error">{modalError}</p>
            ) : null}
            <div className="modal-action mt-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={modalBusy}
                className="btn btn-primary"
              >
                Unlock
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {modal === "bulk_move" ? (
        <ModalShell title="Move selected files" onClose={() => setModal(null)}>
          <form onSubmit={bulkMove} className="flex flex-col gap-3">
            <label className="type-caption opacity-60">
              Destination folder
              <select
                value={bulkFolderId ?? ""}
                onChange={(e) =>
                  setBulkFolderId(e.target.value ? e.target.value : null)
                }
                className="select select-bordered mt-1 w-full"
              >
                <option value="">Space root</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            {modalError ? (
              <p className="type-caption text-error">{modalError}</p>
            ) : null}
            <div className="modal-action mt-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="btn btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={bulkBusy}
                className="btn btn-primary"
              >
                Move {selectedIds.size}
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {modal === "rename" && targetFolder ? (
        <ModalShell title="Rename folder" onClose={() => setModal(null)}>
          <form onSubmit={submitRename} className="flex flex-col gap-3">
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="input input-bordered w-full"
            />
            {modalError ? (
              <p className="type-caption text-error">{modalError}</p>
            ) : null}
            <div className="modal-action mt-2">
              <button type="button" onClick={() => setModal(null)} className="btn btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={modalBusy} className="btn btn-primary">
                Save
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {modal === "move" && targetFolder ? (
        <ModalShell title="Move folder" onClose={() => setModal(null)}>
          <form onSubmit={submitMoveFolder} className="flex flex-col gap-3">
            <select
              value={moveParentId ?? ""}
              onChange={(e) =>
                setMoveParentId(e.target.value ? e.target.value : null)
              }
              className="select select-bordered w-full"
            >
              <option value="">Space root</option>
              {moveTargets.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {modalError ? (
              <p className="type-caption text-error">{modalError}</p>
            ) : null}
            <div className="modal-action mt-2">
              <button type="button" onClick={() => setModal(null)} className="btn btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={modalBusy} className="btn btn-primary">
                Move
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {modal === "passcode" && targetFolder ? (
        <ModalShell
          title={
            targetFolder.passcode_enabled
              ? "Change passcode"
              : "Set passcode"
          }
          onClose={() => setModal(null)}
        >
          <form onSubmit={submitPasscode} className="flex flex-col gap-3">
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
            {modalError ? (
              <p className="type-caption text-error">{modalError}</p>
            ) : null}
            <div className="modal-action mt-2">
              <button type="button" onClick={() => setModal(null)} className="btn btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={modalBusy} className="btn btn-primary">
                Save
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {modal === "confirm_clear" && targetFolder ? (
        <ModalShell title="Turn passcode off" onClose={() => setModal(null)}>
          <div className="flex flex-col gap-3">
            <p className="type-body opacity-60">
              Anyone with access to {space.name} will be able to open “
              {targetFolder.name}” without a passcode.
            </p>
            {modalError ? (
              <p className="type-caption text-error">{modalError}</p>
            ) : null}
            <div className="modal-action mt-2">
              <button type="button" onClick={() => setModal(null)} className="btn btn-ghost">
                Cancel
              </button>
              <button
                type="button"
                disabled={modalBusy}
                onClick={() => void clearPasscode()}
                className="btn btn-primary"
              >
                Turn off
              </button>
            </div>
          </div>
        </ModalShell>
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
        <dialog
          className="modal modal-open"
          onCancel={(e) => {
            e.preventDefault();
            setRenameAssetTarget(null);
          }}
        >
          <div className="glass-scrim absolute inset-0 pointer-events-none" />
          <form
            onSubmit={confirmRenameAsset}
            onClick={(e) => e.stopPropagation()}
            className="modal-box max-w-sm glass-content glass-appear !bg-[var(--content-glass)] border-0 shadow-none"
            style={{ borderRadius: 22 }}
          >
            <h3 className="type-title mb-3">Rename file</h3>
            <input
              autoFocus
              value={renameAssetValue}
              onChange={(e) => setRenameAssetValue(e.target.value)}
              className="glass-input w-full type-body px-3 py-2 rounded-[12px] bg-white/55"
            />
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                className="btn-glass"
                onClick={() => setRenameAssetTarget(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-glass-primary"
                disabled={modalBusy || !renameAssetValue.trim()}
              >
                Save
              </button>
            </div>
          </form>
          <form method="dialog" className="modal-backdrop bg-transparent">
            <button type="button" onClick={() => setRenameAssetTarget(null)}>
              close
            </button>
          </form>
        </dialog>
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
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <dialog
      className="modal modal-open"
      onClick={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="glass-scrim absolute inset-0 pointer-events-none" />
      <div
        className="modal-box max-w-sm glass-content glass-appear !bg-[var(--content-glass)] border-0 shadow-none"
        style={{ borderRadius: 22 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <h2 className="type-title flex-1">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            className="dock-btn !px-2"
            onClick={onClose}
          >
            <IconX size={16} />
          </button>
        </div>
        {children}
      </div>
      <form method="dialog" className="modal-backdrop bg-transparent">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
