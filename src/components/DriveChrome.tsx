"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useFileServerHealth,
  type ServerStatus,
} from "@/lib/useFileServerHealth";
import { uploadFsFileWithProgress } from "@/lib/fsUpload";
import type { Folder, FsNode } from "@/lib/types";
import type { ViewMode } from "@/lib/uiPrefs";

export type TransferJob = {
  id: string;
  name: string;
  progress: number;
  kind: "upload" | "download" | "trash" | "delete" | "restore";
  status: "queued" | "uploading" | "downloading" | "saving" | "done" | "error";
  error?: string;
  viewHref?: string;
  viewLabel?: string;
};

/** @deprecated Use TransferJob */
export type UploadJob = TransferJob;

export type UploadEnqueueItem = {
  file: File;
  folderId: string | null;
  tags?: string[];
  description?: string | null;
  brand?: string | null;
  createdBy?: string | null;
  entityIds?: string[];
  viewHref?: string;
  viewLabel?: string;
};

export type PlaceNavState = {
  folders: Folder[];
  currentFolderId: string | null;
  onNavigateFolder: (folderId: string | null) => void;
  onPrefetchFolder?: (folderId: string | null) => void;
};

export type ExplorerCrumb = { id: string | null; label: string };

export type ExplorerSurface = {
  title: string;
  crumbs: ExplorerCrumb[];
  selected: FsNode | null;
  itemCount: number;
  canCreate: boolean;
  canUpload: boolean;
  canDelete: boolean;
  canRename: boolean;
  searchScopeLabel: string;
  parentFolderId: string | null;
};

export type ExplorerActions = {
  deleteSelection: () => void;
  renameSelection: () => void;
};

type QueuedUpload = UploadEnqueueItem & { jobId: string };

type DriveChromeContextValue = {
  uploadRequestId: number;
  folderRequestId: number;
  requestUpload: () => void;
  requestNewFolder: () => void;
  uploadOpen: boolean;
  uploadSpaceId: string | null;
  openUpload: (spaceId?: string | null) => void;
  closeUpload: () => void;
  serverStatus: ServerStatus;
  serverOnline: boolean;
  jobs: TransferJob[];
  upsertJob: (job: TransferJob) => void;
  removeJob: (id: string) => void;
  clearSettledJobs: () => void;
  enqueueUploads: (items: UploadEnqueueItem[]) => void;
  libraryEpoch: number;
  notifyLibraryChange: () => void;
  transferPanelOpen: boolean;
  setTransferPanelOpen: (open: boolean) => void;
  placeNav: PlaceNavState | null;
  setPlaceNav: (nav: PlaceNavState | null) => void;
  /** Explorer chrome shared between shell + workspace */
  explorer: ExplorerSurface;
  setExplorer: (patch: Partial<ExplorerSurface>) => void;
  setSelectedNode: (node: FsNode | null) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  registerExplorerActions: (actions: ExplorerActions | null) => void;
  explorerActions: ExplorerActions | null;
};

const defaultExplorer: ExplorerSurface = {
  title: "Main Drive",
  crumbs: [{ id: null, label: "Main Drive" }],
  selected: null,
  itemCount: 0,
  canCreate: false,
  canUpload: false,
  canDelete: false,
  canRename: false,
  searchScopeLabel: "Main Drive",
  parentFolderId: null,
};

const DriveChromeContext = createContext<DriveChromeContextValue | null>(null);

export function DriveChromeProvider({ children }: { children: ReactNode }) {
  const [uploadRequestId, setUploadRequestId] = useState(0);
  const [folderRequestId, setFolderRequestId] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadSpaceId, setUploadSpaceId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<TransferJob[]>([]);
  const [placeNav, setPlaceNav] = useState<PlaceNavState | null>(null);
  const [transferPanelOpen, setTransferPanelOpen] = useState(false);
  const [libraryEpoch, setLibraryEpoch] = useState(0);
  const [explorer, setExplorerState] = useState<ExplorerSurface>(defaultExplorer);
  const [viewMode, setViewModeState] = useState<ViewMode>("list");
  const explorerActionsRef = useRef<ExplorerActions | null>(null);
  const [explorerActions, setExplorerActions] = useState<ExplorerActions | null>(
    null,
  );
  const serverStatus = useFileServerHealth();

  const queueRef = useRef<QueuedUpload[]>([]);
  const pumpingRef = useRef(false);

  const notifyLibraryChange = useCallback(() => {
    setLibraryEpoch((n) => n + 1);
  }, []);

  const setExplorer = useCallback((patch: Partial<ExplorerSurface>) => {
    setExplorerState((prev) => ({ ...prev, ...patch }));
  }, []);

  const setSelectedNode = useCallback((node: FsNode | null) => {
    setExplorerState((prev) => ({
      ...prev,
      selected: node,
      canDelete: node ? prev.canDelete : false,
      canRename: node ? prev.canRename : false,
    }));
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode === "photos" ? "grid" : mode);
  }, []);

  const registerExplorerActions = useCallback(
    (actions: ExplorerActions | null) => {
      explorerActionsRef.current = actions;
      setExplorerActions(actions);
    },
    [],
  );

  const openUpload = useCallback((spaceId?: string | null) => {
    if (spaceId) setUploadSpaceId(spaceId);
    setUploadOpen(true);
  }, []);

  const closeUpload = useCallback(() => {
    setUploadOpen(false);
    setUploadSpaceId(null);
  }, []);

  const requestUpload = useCallback(() => {
    setUploadRequestId((n) => n + 1);
  }, []);

  const requestNewFolder = useCallback(() => {
    setFolderRequestId((n) => n + 1);
  }, []);

  const upsertJob = useCallback((job: TransferJob) => {
    setJobs((prev) => {
      const i = prev.findIndex((j) => j.id === job.id);
      if (i === -1) return [...prev, job];
      const next = [...prev];
      next[i] = job;
      return next;
    });
  }, []);

  const removeJob = useCallback((id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }, []);

  const clearSettledJobs = useCallback(() => {
    setJobs((prev) =>
      prev.filter(
        (j) =>
          j.status === "queued" ||
          j.status === "uploading" ||
          j.status === "downloading" ||
          j.status === "saving",
      ),
    );
  }, []);

  const pumpUploads = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;

    while (queueRef.current.length > 0) {
      const item = queueRef.current.shift()!;
      const {
        jobId,
        file,
        folderId,
        tags,
        description,
        createdBy,
        entityIds,
        viewHref,
        viewLabel,
      } = item;

      upsertJob({
        id: jobId,
        name: file.name,
        progress: 0,
        kind: "upload",
        status: "uploading",
        viewHref,
        viewLabel,
      });

      try {
        await uploadFsFileWithProgress({
          file,
          parentId: folderId,
          tags,
          description,
          createdBy,
          onProgress: (pct) =>
            upsertJob({
              id: jobId,
              name: file.name,
              progress: pct,
              kind: "upload",
              status: pct >= 100 ? "saving" : "uploading",
              viewHref,
              viewLabel,
            }),
        });

        void entityIds;

        upsertJob({
          id: jobId,
          name: file.name,
          progress: 100,
          kind: "upload",
          status: "done",
          viewHref,
          viewLabel,
        });
        notifyLibraryChange();
      } catch (err) {
        upsertJob({
          id: jobId,
          name: file.name,
          progress: 0,
          kind: "upload",
          status: "error",
          error: err instanceof Error ? err.message : "Upload failed",
          viewHref,
          viewLabel,
        });
      }
    }

    pumpingRef.current = false;
  }, [notifyLibraryChange, upsertJob]);

  const enqueueUploads = useCallback(
    (items: UploadEnqueueItem[]) => {
      if (items.length === 0) return;
      const queued: QueuedUpload[] = items.map((item, index) => {
        const jobId = `up-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
        return { ...item, jobId };
      });

      setJobs((prev) => [
        ...prev,
        ...queued.map((q) => ({
          id: q.jobId,
          name: q.file.name,
          progress: 0,
          kind: "upload" as const,
          status: "queued" as const,
          viewHref: q.viewHref,
          viewLabel: q.viewLabel,
        })),
      ]);

      queueRef.current.push(...queued);
      void pumpUploads();
    },
    [pumpUploads],
  );

  const value = useMemo(
    () => ({
      uploadRequestId,
      folderRequestId,
      requestUpload,
      requestNewFolder,
      uploadOpen,
      uploadSpaceId,
      openUpload,
      closeUpload,
      serverStatus,
      serverOnline: serverStatus === "connected",
      jobs,
      upsertJob,
      removeJob,
      clearSettledJobs,
      enqueueUploads,
      libraryEpoch,
      notifyLibraryChange,
      transferPanelOpen,
      setTransferPanelOpen,
      placeNav,
      setPlaceNav,
      explorer,
      setExplorer,
      setSelectedNode,
      viewMode,
      setViewMode,
      registerExplorerActions,
      explorerActions,
    }),
    [
      uploadRequestId,
      folderRequestId,
      requestUpload,
      requestNewFolder,
      uploadOpen,
      uploadSpaceId,
      openUpload,
      closeUpload,
      serverStatus,
      jobs,
      upsertJob,
      removeJob,
      clearSettledJobs,
      enqueueUploads,
      libraryEpoch,
      notifyLibraryChange,
      transferPanelOpen,
      placeNav,
      explorer,
      setExplorer,
      setSelectedNode,
      viewMode,
      setViewMode,
      registerExplorerActions,
      explorerActions,
    ],
  );

  return (
    <DriveChromeContext.Provider value={value}>
      {children}
    </DriveChromeContext.Provider>
  );
}

export function useDriveChrome() {
  const ctx = useContext(DriveChromeContext);
  if (!ctx) {
    throw new Error("useDriveChrome must be used within DriveChromeProvider");
  }
  return ctx;
}
