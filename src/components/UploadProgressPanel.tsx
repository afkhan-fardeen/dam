"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconChevronDown, IconChevronUp, IconX } from "@tabler/icons-react";
import Link from "next/link";
import { useDriveChrome, type TransferJob } from "@/components/DriveChrome";
import {
  readTransferPanelPos,
  writeTransferPanelPos,
} from "@/lib/uiPrefs";

function statusLabel(job: TransferJob): string {
  switch (job.status) {
    case "queued":
      return "Waiting";
    case "uploading":
      return `${Math.round(job.progress)}%`;
    case "saving":
      if (job.kind === "trash") return "Trashing…";
      if (job.kind === "delete") return "Deleting…";
      if (job.kind === "restore") return "Restoring…";
      return "Saving…";
    case "downloading":
      return `${Math.round(job.progress)}%`;
    case "done":
      if (job.kind === "trash") return "Trashed";
      if (job.kind === "delete") return "Deleted";
      if (job.kind === "restore") return "Restored";
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

  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{
    ox: number;
    oy: number;
    left: number;
    top: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPos(readTransferPanelPos());
  }, []);

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
  const trashing = jobs.filter(
    (j) =>
      (j.kind === "trash" || j.kind === "delete" || j.kind === "restore") &&
      (j.status === "queued" || j.status === "saving"),
  );
  const done = jobs.filter((j) => j.status === "done");
  const errored = jobs.filter((j) => j.status === "error");
  const uploadJobs = jobs.filter((j) => j.kind === "upload");
  const trashJobs = jobs.filter(
    (j) =>
      j.kind === "trash" || j.kind === "delete" || j.kind === "restore",
  );

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

  const prevActiveCount = useRef(0);
  const userMinimized = useRef(false);
  useEffect(() => {
    if (active.length === 0) {
      userMinimized.current = false;
    } else if (prevActiveCount.current === 0 && !userMinimized.current) {
      setTransferPanelOpen(true);
    }
    prevActiveCount.current = active.length;
  }, [active.length, setTransferPanelOpen]);

  function minimizePanel() {
    userMinimized.current = true;
    setTransferPanelOpen(false);
  }

  function clampPos(left: number, top: number) {
    const w = panelRef.current?.offsetWidth ?? 320;
    const h = panelRef.current?.offsetHeight ?? 120;
    const maxL = Math.max(8, window.innerWidth - w - 8);
    const maxT = Math.max(8, window.innerHeight - h - 8);
    return {
      left: Math.min(Math.max(8, left), maxL),
      top: Math.min(Math.max(8, top), maxT),
    };
  }

  function onDragStart(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button,a,input")) return;
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const current = pos ?? { left: rect.left, top: rect.top };
    dragRef.current = {
      ox: e.clientX,
      oy: e.clientY,
      left: current.left,
      top: current.top,
    };
    el.setPointerCapture(e.pointerId);
  }

  function onDragMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const d = dragRef.current;
    const next = clampPos(
      d.left + (e.clientX - d.ox),
      d.top + (e.clientY - d.oy),
    );
    setPos(next);
  }

  function onDragEnd(e: React.PointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    if (pos) writeTransferPanelPos(pos);
  }

  if (jobs.length === 0) return null;

  const summary = (() => {
    if (uploading.length > 0) {
      const finished = done.filter((j) => j.kind === "upload").length;
      const total = uploadJobs.length;
      return `Uploading ${finished + 1} of ${total}`;
    }
    if (trashing.length > 0) {
      const deleting = trashJobs.some((j) => j.kind === "delete");
      const restoring = trashJobs.some((j) => j.kind === "restore");
      const finished = done.filter(
        (j) =>
          j.kind === "trash" || j.kind === "delete" || j.kind === "restore",
      ).length;
      const total = trashJobs.length;
      const verb = deleting
        ? "Deleting"
        : restoring
          ? "Restoring"
          : "Moving to trash";
      return `${verb} ${Math.min(finished + 1, total)} of ${total}`;
    }
    if (errored.length > 0 && active.length === 0) {
      return `${done.length} done · ${errored.length} failed`;
    }
    if (done.length > 0 && active.length === 0) {
      const trashed = done.filter((j) => j.kind === "trash").length;
      const deleted = done.filter((j) => j.kind === "delete").length;
      const restored = done.filter((j) => j.kind === "restore").length;
      const uploaded = done.filter((j) => j.kind === "upload").length;
      if (trashed > 0 && uploaded === 0 && deleted === 0 && restored === 0) {
        return trashed === 1 ? "Moved to trash" : `${trashed} moved to trash`;
      }
      if (deleted > 0 && uploaded === 0 && trashed === 0 && restored === 0) {
        return deleted === 1 ? "Deleted" : `${deleted} deleted`;
      }
      if (restored > 0 && uploaded === 0 && trashed === 0 && deleted === 0) {
        return restored === 1 ? "Restored" : `${restored} restored`;
      }
      if (uploaded > 0) return `${uploaded} uploaded`;
      return `${done.length} done`;
    }
    return `${jobs.length} transfers`;
  })();

  const dangerActive = trashing.some(
    (j) => j.kind === "trash" || j.kind === "delete",
  );

  const style: React.CSSProperties = pos
    ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" }
    : {};

  if (!transferPanelOpen) {
    return (
      <div
        ref={panelRef}
        className="transfer-toast transfer-toast--min"
        style={style}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
      >
        <button
          type="button"
          onClick={() => {
            userMinimized.current = false;
            setTransferPanelOpen(true);
          }}
          className="transfer-toast-min-btn"
        >
          {active.length > 0 ? (
            <span
              className={`transfer-spinner${dangerActive ? " is-danger" : ""}`}
              aria-hidden
            />
          ) : null}
          <span className={dangerActive ? "transfer-summary is-danger" : undefined}>
            {summary}
          </span>
          {uploadJobs.length > 0 && active.length > 0 ? (
            <span className="transfer-min-pct">{overallPct}%</span>
          ) : null}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="transfer-toast"
      role="status"
      aria-live="polite"
      style={style}
    >
      <div className="transfer-panel">
        <div
          className="transfer-panel-head transfer-drag-handle"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
        >
          <div className="transfer-panel-heading min-w-0">
            <p className="transfer-panel-title">Activity</p>
            <p
              className={`transfer-panel-summary${
                dangerActive ? " is-danger" : ""
              }`}
            >
              {summary}
            </p>
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
              onClick={minimizePanel}
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
          {jobs.map((job) => {
            const isDangerKind =
              job.kind === "trash" || job.kind === "delete";
            const kindClass = isDangerKind
              ? " kind-danger"
              : job.kind === "restore"
                ? " kind-restore"
                : "";
            return (
              <li key={job.id} className="transfer-job">
                <div className="transfer-job-row">
                  <p
                    className={`transfer-job-name${
                      job.status === "error"
                        ? " is-error"
                        : job.status === "done"
                          ? isDangerKind
                            ? " is-error"
                            : " is-done"
                          : ""
                    }`}
                    title={job.name}
                  >
                    {job.name}
                  </p>
                  <span
                    className={`transfer-job-badge status-${job.status}${kindClass}`}
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
                      className={`transfer-progress-bar${
                        isDangerKind ? " is-danger" : ""
                      }`}
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
                    <div
                      className={`transfer-progress-bar is-queued${
                        isDangerKind ? " is-danger" : ""
                      }`}
                      style={{ width: "4%" }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
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
            {trashing.length > 0
              ? "You can keep browsing — this continues in the background."
              : "You can keep browsing — uploads continue in the background."}
          </p>
        ) : null}

        {!transferPanelOpen ? null : (
          <button
            type="button"
            className="transfer-expand-toggle sr-only"
            onClick={minimizePanel}
          >
            <IconChevronUp size={14} /> Minimize
          </button>
        )}
      </div>
    </div>
  );
}
