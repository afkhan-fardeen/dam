/** Fetch a file with XHR progress and save via a same-tab blob download. */

export type DownloadFileOptions = {
  url: string;
  fileName: string;
  onProgress?: (pct: number) => void;
};

type TransferJobPatch = {
  id: string;
  name: string;
  progress: number;
  kind: "upload" | "download" | "trash" | "delete" | "restore";
  status: "uploading" | "downloading" | "saving" | "done" | "error";
  error?: string;
};

type JobFns = {
  upsertJob: (job: TransferJobPatch) => void;
  removeJob: (id: string) => void;
};

/** Queue a media download with the bottom transfer toast (no new tab). */
export async function queueAssetDownload(
  fileId: string,
  fileName: string,
  { upsertJob, removeJob }: JobFns,
): Promise<void> {
  const jobId = `dl-${Date.now()}-${fileId}`;
  const name = fileName || "download";
  upsertJob({
    id: jobId,
    name,
    progress: 0,
    kind: "download",
    status: "downloading",
  });
  try {
    await downloadFileWithProgress({
      url: `/api/media/asset/${encodeURIComponent(fileId)}?download=1`,
      fileName: name,
      onProgress: (pct) =>
        upsertJob({
          id: jobId,
          name,
          progress: pct,
          kind: "download",
          status: "downloading",
        }),
    });
    upsertJob({
      id: jobId,
      name,
      progress: 100,
      kind: "download",
      status: "done",
    });
    window.setTimeout(() => removeJob(jobId), 1500);
  } catch (err) {
    upsertJob({
      id: jobId,
      name,
      progress: 0,
      kind: "download",
      status: "error",
      error: err instanceof Error ? err.message : "Download failed.",
    });
  }
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName || "download";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export function downloadFileWithProgress(
  options: DownloadFileOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", options.url);
    xhr.responseType = "blob";
    xhr.withCredentials = true;

    xhr.onprogress = (e) => {
      if (!e.lengthComputable || !options.onProgress) return;
      options.onProgress(Math.min(99, (e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`Download failed (${xhr.status}).`));
        return;
      }
      const blob = xhr.response as Blob;
      triggerBlobDownload(blob, options.fileName);
      options.onProgress?.(100);
      resolve();
    };

    xhr.onerror = () => reject(new Error("Network error during download."));
    xhr.onabort = () => reject(new Error("Download aborted."));
    xhr.send();
  });
}
