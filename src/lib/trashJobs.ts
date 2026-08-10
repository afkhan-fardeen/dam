export type TrashJobKind = "trash" | "delete" | "restore";

export type TrashTransferJob = {
  id: string;
  name: string;
  progress: number;
  kind: TrashJobKind;
  status: "queued" | "saving" | "done" | "error";
  error?: string;
};

type TrashJobFns = {
  upsertJob: (job: TrashTransferJob) => void;
  setTransferPanelOpen?: (open: boolean) => void;
  notifyLibraryChange?: () => void;
};

export type TrashableAsset = {
  id: string;
  original_name?: string | null;
};

/**
 * Move files to trash (or permanently delete) with bottom-right activity jobs.
 * Returns successfully removed asset ids.
 */
export async function queueAssetTrash(
  assets: TrashableAsset[],
  {
    upsertJob,
    setTransferPanelOpen,
    notifyLibraryChange,
    permanent = false,
  }: TrashJobFns & { permanent?: boolean },
): Promise<string[]> {
  if (assets.length === 0) return [];

  const kind: TrashJobKind = permanent ? "delete" : "trash";
  const stamp = Date.now();
  const jobs = assets.map((asset, i) => ({
    asset,
    jobId: `${kind}-${stamp}-${i}-${asset.id}`,
    name: asset.original_name?.trim() || (permanent ? "Deleting…" : "File"),
  }));

  for (const job of jobs) {
    upsertJob({
      id: job.jobId,
      name: job.name,
      progress: 0,
      kind,
      status: "queued",
    });
  }

  const removed: string[] = [];

  for (const job of jobs) {
    upsertJob({
      id: job.jobId,
      name: job.name,
      progress: 20,
      kind,
      status: "saving",
    });

    try {
      const url = permanent
        ? `/api/assets/${job.asset.id}?permanent=1`
        : `/api/assets/${job.asset.id}`;
      const res = await fetch(url, { method: "DELETE" });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(
          json?.error ||
            (permanent ? "Could not delete file." : "Could not move to trash."),
        );
      }

      removed.push(job.asset.id);
      upsertJob({
        id: job.jobId,
        name: job.name,
        progress: 100,
        kind,
        status: "done",
      });
    } catch (err) {
      upsertJob({
        id: job.jobId,
        name: job.name,
        progress: 0,
        kind,
        status: "error",
        error:
          err instanceof Error
            ? err.message
            : permanent
              ? "Delete failed."
              : "Trash failed.",
      });
    }
  }

  if (removed.length > 0) notifyLibraryChange?.();
  return removed;
}

/** Restore trashed files in the background activity panel. */
export async function queueAssetRestore(
  assets: TrashableAsset[],
  { upsertJob, setTransferPanelOpen, notifyLibraryChange }: TrashJobFns,
): Promise<string[]> {
  if (assets.length === 0) return [];

  const stamp = Date.now();
  const jobs = assets.map((asset, i) => ({
    asset,
    jobId: `restore-${stamp}-${i}-${asset.id}`,
    name: asset.original_name?.trim() || "File",
  }));

  for (const job of jobs) {
    upsertJob({
      id: job.jobId,
      name: job.name,
      progress: 0,
      kind: "restore",
      status: "queued",
    });
  }

  const restored: string[] = [];

  for (const job of jobs) {
    upsertJob({
      id: job.jobId,
      name: job.name,
      progress: 20,
      kind: "restore",
      status: "saving",
    });

    try {
      const res = await fetch(`/api/assets/${job.asset.id}/restore`, {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(json?.error || "Could not restore file.");
      }

      restored.push(job.asset.id);
      upsertJob({
        id: job.jobId,
        name: job.name,
        progress: 100,
        kind: "restore",
        status: "done",
      });
    } catch (err) {
      upsertJob({
        id: job.jobId,
        name: job.name,
        progress: 0,
        kind: "restore",
        status: "error",
        error: err instanceof Error ? err.message : "Restore failed.",
      });
    }
  }

  if (restored.length > 0) notifyLibraryChange?.();
  return restored;
}

/** Fetch all trash refs then permanently delete them in the activity panel. */
export async function queueEmptyTrash(
  {
    upsertJob,
    setTransferPanelOpen,
    notifyLibraryChange,
    spaceId,
  }: TrashJobFns & { spaceId?: string | null },
): Promise<number> {
  const qs = spaceId ? `?space_id=${encodeURIComponent(spaceId)}` : "";
  const res = await fetch(`/api/trash${qs}`, { method: "DELETE" });
  const json = (await res.json().catch(() => null)) as {
    items?: TrashableAsset[];
    total?: number;
    error?: string;
  } | null;
  if (!res.ok) {
    throw new Error(json?.error || "Could not empty trash.");
  }
  const items = json?.items ?? [];
  if (items.length === 0) return 0;
  const removed = await queueAssetTrash(items, {
    upsertJob,
    setTransferPanelOpen,
    notifyLibraryChange,
    permanent: true,
  });
  return removed.length;
}
