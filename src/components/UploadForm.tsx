"use client";

import { useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { uploadFileWithProgress } from "@/lib/upload";
import { useDriveChrome } from "@/components/DriveChrome";
import { getTagChipStyles } from "@/lib/categories";

type UploadFormProps = {
  spaceId: string;
  folderId: string | null;
  defaultCreatedBy: string;
  onUploaded: (assetIds?: string[]) => void;
  onCancel: () => void;
  initialFile?: File | null;
};

export function UploadForm({
  spaceId,
  folderId,
  defaultCreatedBy,
  onUploaded,
  onCancel,
  initialFile = null,
}: UploadFormProps) {
  const { upsertJob, removeJob, serverOnline } = useDriveChrome();
  const [file, setFile] = useState<File | null>(initialFile);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [description, setDescription] = useState("");
  const [createdBy, setCreatedBy] = useState(defaultCreatedBy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addNames(raw: string, base: string[] = tags): string[] {
    const parts = raw
      .split(/[,;\n]/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return base;
    const next = [...base];
    for (const name of parts) {
      if (next.some((t) => t.toLowerCase() === name.toLowerCase())) continue;
      next.push(name);
    }
    return next;
  }

  function commitDraftTag(): string[] {
    const next = addNames(tagDraft, tags);
    setTags(next);
    setTagDraft("");
    return next;
  }

  async function runUpload(target: File, tagList: string[]) {
    if (!serverOnline) {
      setError("File server is offline — uploads are paused.");
      return;
    }
    setBusy(true);
    setError(null);
    const jobId = `${Date.now()}-${target.name}`;
    upsertJob({
      id: jobId,
      name: target.name,
      progress: 0,
      kind: "upload",
      status: "uploading",
    });

    try {
      const asset = await uploadFileWithProgress({
        file: target,
        spaceId,
        folderId,
        tags: tagList,
        description: description || null,
        createdBy: createdBy || null,
        onProgress: (pct) =>
          upsertJob({
            id: jobId,
            name: target.name,
            progress: pct,
            kind: "upload",
            status: pct >= 100 ? "saving" : "uploading",
          }),
      });
      upsertJob({
        id: jobId,
        name: target.name,
        progress: 100,
        kind: "upload",
        status: "done",
      });
      window.setTimeout(() => removeJob(jobId), 1800);
      onUploaded(asset?.id ? [asset.id] : undefined);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload failed. Try again.";
      setError(message);
      upsertJob({
        id: jobId,
        name: target.name,
        progress: 0,
        kind: "upload",
        status: "error",
        error: message,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    const tagList = commitDraftTag();
    await runUpload(file, tagList);
  }

  return (
    <dialog
      className="modal modal-open"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="modal-box max-w-md rounded-none p-0 flex flex-col max-h-[min(90vh,560px)]"
      >
        <div className="shrink-0 flex items-center gap-2 px-4 pt-4 pb-2 border-b border-base-300">
          <h3 className="type-title flex-1">Upload file</h3>
          <button
            type="button"
            aria-label="Close"
            className="btn btn-ghost btn-sm btn-square"
            disabled={busy}
            onClick={onCancel}
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="type-caption opacity-60">File</span>
            <input
              ref={inputRef}
              type="file"
              className="file-input file-input-bordered file-input-sm w-full type-body"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              autoFocus
            />
            {file ? (
              <span className="type-caption text-success truncate">
                {file.name}
              </span>
            ) : null}
          </label>

          <div className="flex flex-col gap-1">
            <span className="type-caption opacity-60">Tags</span>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => {
                  const chip = getTagChipStyles(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        setTags((prev) => prev.filter((x) => x !== t))
                      }
                      className="badge badge-sm gap-1 font-normal"
                      style={chip.style}
                    >
                      {t}
                      <IconX size={10} />
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div className="flex gap-1.5">
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onBlur={() => {
                  if (tagDraft.trim()) commitDraftTag();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    commitDraftTag();
                  }
                }}
                placeholder="Type a tag, then Enter"
                className="input input-bordered input-sm flex-1 type-body"
                disabled={busy}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy || !tagDraft.trim()}
                onClick={() => commitDraftTag()}
              >
                Add
              </button>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="type-caption opacity-60">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input input-bordered input-sm w-full type-body"
              disabled={busy}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="type-caption opacity-60">Credit</span>
            <input
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              className="input input-bordered input-sm w-full type-body"
              disabled={busy}
            />
          </label>

          {error ? (
            <p className="type-caption text-error alert alert-error py-2 px-3">
              {error}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 modal-action px-4 py-3 mt-0 border-t border-base-300">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !serverOnline}
            className="btn btn-primary btn-sm"
          >
            {busy ? (
              <span className="loading loading-spinner loading-xs" />
            ) : null}
            {busy ? "Uploading…" : "Upload"}
          </button>
        </div>
      </form>
      <form method="dialog" className="modal-backdrop">
        <button type="button" disabled={busy} onClick={onCancel}>
          close
        </button>
      </form>
    </dialog>
  );
}
