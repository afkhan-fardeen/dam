"use client";

import { useState } from "react";
import { IconChevronDown, IconX } from "@tabler/icons-react";
import { useDriveChrome } from "@/components/DriveChrome";

export function UploadProgressPanel() {
  const { jobs, removeJob } = useDriveChrome();
  const [minimized, setMinimized] = useState(false);
  // Keep "done" visible briefly so success color is readable.
  const panelJobs = jobs;
  const active = jobs.filter(
    (j) =>
      j.status === "uploading" ||
      j.status === "downloading" ||
      j.status === "saving",
  );
  const errored = jobs.filter((j) => j.status === "error");
  const done = jobs.filter((j) => j.status === "done");
  const uploading = active.filter((j) => j.kind === "upload").length;
  const downloading = active.filter((j) => j.kind === "download").length;

  if (panelJobs.length === 0) return null;

  function activeLabel() {
    if (errored.length > 0 && active.length === 0) {
      return `${errored.length} failed`;
    }
    if (uploading > 0 && downloading > 0) {
      return `${active.length} transferring`;
    }
    if (downloading > 0) {
      return `${downloading} downloading`;
    }
    if (uploading > 0) {
      return `${uploading} uploading`;
    }
    if (done.length > 0) {
      return `${done.length} done`;
    }
    return `${panelJobs.length} transfers`;
  }

  const minimizedTone =
    errored.length > 0 && active.length === 0
      ? "alert-error"
      : done.length > 0 && active.length === 0
        ? "alert-success"
        : "alert-info";

  if (minimized) {
    return (
      <div className="toast toast-end toast-bottom z-[60] mb-16 sm:mb-0">
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className={`alert ${minimizedTone} shadow-lg py-2 px-3 text-xs gap-2`}
        >
          {active.length > 0 ? (
            <span className="loading loading-spinner loading-xs" />
          ) : null}
          {activeLabel()}
        </button>
      </div>
    );
  }

  return (
    <div className="toast toast-end toast-bottom z-[60] mb-16 sm:mb-0 w-full sm:w-80 max-w-full">
      <div className="alert bg-base-100 shadow-lg flex-col items-stretch gap-3 py-3 border border-base-300">
        <div className="flex items-center justify-between gap-2 w-full">
          <p className="text-sm font-semibold">Transfers</p>
          <button
            type="button"
            aria-label="Minimize"
            onClick={() => setMinimized(true)}
            className="btn btn-ghost btn-xs btn-circle"
          >
            <IconChevronDown size={16} />
          </button>
        </div>
        {panelJobs.map((job) => {
          const progressClass =
            job.status === "error"
              ? "progress-error"
              : job.status === "done"
                ? "progress-success"
                : job.status === "saving"
                  ? "progress-warning"
                  : job.kind === "download"
                    ? "progress-info"
                    : "progress-primary";

          const statusText =
            job.status === "error"
              ? job.error || "Failed"
              : job.status === "done"
                ? "Done"
                : job.status === "saving"
                  ? "Saving details…"
                  : job.status === "downloading"
                    ? `Downloading… ${Math.round(job.progress)}%`
                    : `Uploading… ${Math.round(job.progress)}%`;

          const nameClass =
            job.status === "error"
              ? "text-error"
              : job.status === "done"
                ? "text-success"
                : "";

          return (
            <div key={job.id} className="flex flex-col gap-1 w-full">
              <div className="flex items-center justify-between gap-2">
                <p className={`text-xs truncate flex-1 font-medium ${nameClass}`}>
                  {job.name}
                </p>
                {job.status === "error" || job.status === "done" ? (
                  <button
                    type="button"
                    className={`btn btn-ghost btn-xs gap-1 ${
                      job.status === "error" ? "text-error" : "text-success"
                    }`}
                    aria-label="Dismiss"
                    onClick={() => removeJob(job.id)}
                  >
                    <IconX size={14} />
                    {job.status === "error" ? "Dismiss" : null}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-circle"
                    aria-label="Dismiss"
                    onClick={() => removeJob(job.id)}
                  >
                    <IconX size={14} />
                  </button>
                )}
              </div>
              {job.status === "error" ? (
                <p className="text-[11px] text-error">{job.error}</p>
              ) : (
                <>
                  <progress
                    className={`progress ${progressClass} w-full`}
                    value={
                      job.status === "saving" || job.status === "done"
                        ? 100
                        : job.progress
                    }
                    max={100}
                  />
                  <p
                    className={`text-[11px] ${
                      job.status === "done"
                        ? "text-success"
                        : job.status === "saving"
                          ? "text-warning"
                          : "text-base-content/60"
                    }`}
                  >
                    {statusText}
                  </p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
