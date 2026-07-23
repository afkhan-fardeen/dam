"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useFileServerHealth } from "@/lib/useFileServerHealth";

export type TransferJob = {
  id: string;
  name: string;
  progress: number; // 0–100
  kind: "upload" | "download";
  status: "uploading" | "downloading" | "saving" | "done" | "error";
  error?: string;
};

/** @deprecated Use TransferJob */
export type UploadJob = TransferJob;

type DriveChromeContextValue = {
  uploadRequestId: number;
  folderRequestId: number;
  requestUpload: () => void;
  requestNewFolder: () => void;
  serverOnline: boolean;
  jobs: TransferJob[];
  upsertJob: (job: TransferJob) => void;
  removeJob: (id: string) => void;
};

const DriveChromeContext = createContext<DriveChromeContextValue | null>(null);

export function DriveChromeProvider({ children }: { children: ReactNode }) {
  const [uploadRequestId, setUploadRequestId] = useState(0);
  const [folderRequestId, setFolderRequestId] = useState(0);
  const [jobs, setJobs] = useState<TransferJob[]>([]);
  const health = useFileServerHealth();

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

  const value = useMemo(
    () => ({
      uploadRequestId,
      folderRequestId,
      requestUpload,
      requestNewFolder,
      serverOnline: health === "connected",
      jobs,
      upsertJob,
      removeJob,
    }),
    [
      uploadRequestId,
      folderRequestId,
      requestUpload,
      requestNewFolder,
      health,
      jobs,
      upsertJob,
      removeJob,
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
