"use client";

import { useEffect, useMemo } from "react";
import { IconChevronDown, IconChevronUp, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useDriveChrome, type TransferJob } from "@/components/DriveChrome";

function statusLabel(job: TransferJob): string {
  switch (job.status) {
    case "queued":
      return "Waiting";
    case "uploading":
      return `${Math.round(job.progress)}%`;
    case "saving":
      return "Saving…";
    case "downloading":
      return `${Math.round(job.progress)}%`;
    case "done":
      return "Done";
    case "error":
      return job.error || "Failed";
    default:
      return "";
  }
}

export function UploadProgressPanel() {
  const {
    jobs,
    removeJob,
    clearSettledJobs,
    transferPanelOpen,
    setTransferPanelOpen,
  } = useDriveChrome();

  const active = jobs.filter(
    (j) =>
      j.status === "queued" ||
      j.status === "uploading" ||
      j.status === "downloading" ||
      j.status === "saving",
  );
  const uploading = jobs.filter(
    (j) =>
      j.kind === "upload" &&
      (j.status === "queued" ||
        j.status === "uploading" ||
        j.status === "saving"),
  );
  const done = jobs.filter((j) => j.status === "done");
  const errored = jobs.filter((j) => j.status === "error");
  const uploadJobs = jobs.filter((j) => j.kind === "upload");

  const settledUploads =
    uploadJobs.length > 0 &&
    uploadJobs.every((j) => j.status === "done" || j.status === "error");

  const overallPct = useMemo(() => {
    if (uploadJobs.length === 0) return 0;
    const sum = uploadJobs.reduce((acc, j) => {
      if (j.status === "done") return acc + 100;
      if (j.status === "error") return acc + 100;
      if (j.status === "saving") return acc + 100;
      if (j.status === "queued") return acc;
      return acc + j.progress;
    }, 0);
    return Math.round(sum / uploadJobs.length);
  }, [uploadJobs]);

  const viewTarget = useMemo(() => {
    const withView = jobs.find((j) => j.viewHref && j.status === "done");
    if (!withView?.viewHref) return null;
    return {
      href: withView.viewHref,
      label: withView.viewLabel || "location",
    };
  }, [jobs]);

  // Auto-expand when new work starts
  useEffect(() => {
    if (active.length > 0) setTransferPanelOpen(true);
  }, [active.length, setTransferPanelOpen]);

  if (jobs.length === 0) return null;

  const summary = (() => {
    if (uploading.length > 0) {
      const finished = done.filter((j) => j.kind === "upload").length;
      const total = uploadJobs.length;
      return `Uploading ${finished + 1} of ${total}`;
    }
    if (errored.length > 0 && active.length === 0) {
      return `${done.length} done · ${errored.length} failed`;
    }
    if (done.length > 0 && active.length === 0) {
      return `${done.length} uploaded`;
    }
    return `${jobs.length} transfers`;
  })();

  if (!transferPanelOpen) {
    return (
      <div className="transfer-toast transfer-toast--min">
        <button
          type="button"
          onClick={() => setTransferPanelOpen(true)}
          className="transfer-toast-min-btn"
        >
          {active.length > 0 ? (
            <span className="transfer-spinner" aria-hidden />
          ) : null}
          <span>{summary}</span>
          {uploadJobs.length > 0 && active.length > 0 ? (
            <span className="transfer-min-pct">{overallPct}%</span>
          ) : null}
        </button>
      </div>
    );
  }

  return (
    <div className="transfer-toast" role="status" aria-live="polite">
      <div className="transfer-panel">
        <div className="transfer-panel-head">
          <div className="transfer-panel-heading min-w-0">
            <p className="transfer-panel-title">Activity</p>
            <p className="transfer-panel-summary">{summary}</p>
          </div>
          <div className="transfer-panel-actions">
            {(done.length > 0 || errored.length > 0) && active.length === 0 ? (
              <button
                type="button"
                className="transfer-text-btn"
                onClick={() => clearSettledJobs()}
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Minimize"
              onClick={() => setTransferPanelOpen(false)}
              className="flat-modal-close !w-7 !h-7"
            >
              <IconChevronDown size={16} />
            </button>
          </div>
        </div>

        {uploadJobs.length > 1 ? (
          <div className="transfer-overall">
            <div className="transfer-progress-track">
              <div
                className={`transfer-progress-bar${
                  settledUploads && errored.length === 0 ? " is-done" : ""
                }${settledUploads && errored.length > 0 ? " is-mixed" : ""}`}
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <span className="transfer-overall-label">{overallPct}%</span>
          </div>
        ) : null}

        <ul className="transfer-job-list">
          {jobs.map((job) => (
            <li key={job.id} className="transfer-job">
              <div className="transfer-job-row">
                <p
                  className={`transfer-job-name${
                    job.status === "error"
                      ? " is-error"
                      : job.status === "done"
                        ? " is-done"
                        : ""
                  }`}
                  title={job.name}
                >
                  {job.name}
                </p>
                <span
                  className={`transfer-job-badge status-${job.status}`}
                >
                  {statusLabel(job)}
                </span>
                {job.status === "done" || job.status === "error" ? (
                  <button
                    type="button"
                    className="flat-modal-close !w-6 !h-6"
                    aria-label="Dismiss"
                    onClick={() => removeJob(job.id)}
                  >
                    <IconX size={14} />
                  </button>
                ) : null}
              </div>
              {job.status === "uploading" ||
              job.status === "downloading" ||
              job.status === "saving" ? (
                <div className="transfer-progress-track">
                  <div
                    className="transfer-progress-bar"
                    style={{
                      width: `${
                        job.status === "saving" ? 100 : job.progress
                      }%`,
                    }}
                  />
                </div>
              ) : null}
              {job.status === "queued" ? (
                <div className="transfer-progress-track">
                  <div className="transfer-progress-bar is-queued" style={{ width: "4%" }} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>

        {settledUploads && viewTarget ? (
          <div className="transfer-view">
            <span className="transfer-view-copy">
              {errored.length > 0
                ? `${done.length} uploaded · ${errored.length} failed`
                : `Uploaded to ${viewTarget.label}`}
            </span>
            <Link href={viewTarget.href} className="transfer-view-link">
              View
            </Link>
          </div>
        ) : active.length > 0 ? (
          <p className="transfer-hint">
            You can keep browsing — uploads continue in the background.
          </p>
        ) : null}

        {!transferPanelOpen ? null : (
          <button
            type="button"
            className="transfer-expand-toggle sr-only"
            onClick={() => setTransferPanelOpen(false)}
          >
            <IconChevronUp size={14} /> Minimize
          </button>
        )}
      </div>
    </div>
  );
}
