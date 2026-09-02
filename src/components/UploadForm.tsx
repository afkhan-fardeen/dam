"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconFolderPlus, IconX } from "@tabler/icons-react";
import { useDriveChrome } from "@/components/DriveChrome";
import { getTagChipStyles } from "@/lib/categories";
import { Button } from "@/components/ui/Button";
import type { FsNode } from "@/lib/types";

type DestinationOption = {
  id: string;
  name: string;
  slug: string;
};

type UploadFormProps = {
  spaceId: string;
  spaceName: string;
  spaceSlug: string;
  folderId: string | null;
  folderName: string | null;
  defaultCreatedBy: string;
  destinationOptions: DestinationOption[];
  onUploaded?: (assetIds?: string[]) => void;
  onCancel: () => void;
  onStarted?: () => void;
  initialFile?: File | null;
};

type QueuedFile = {
  key: string;
  file: File;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKey(file: File, index: number): string {
  return `${file.name}:${file.size}:${file.lastModified}:${index}`;
}

export function UploadForm({
  folderId: initialFolderId,
  folderName: initialFolderName,
  defaultCreatedBy,
  onUploaded,
  onCancel,
  onStarted,
  initialFile = null,
}: UploadFormProps) {
  const { enqueueUploads, serverOnline } = useDriveChrome();
  const [destFolderId, setDestFolderId] = useState<string | null>(initialFolderId);
  const [folders, setFolders] = useState<FsNode[]>([]);

  useEffect(() => {
    setDestFolderId(initialFolderId);
  }, [initialFolderId]);

  const [queue, setQueue] = useState<QueuedFile[]>(() =>
    initialFile
      ? [{ key: fileKey(initialFile, 0), file: initialFile }]
      : [],
  );
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const folderInputId = useId();

  const destFolderName =
    destFolderId == null
      ? "Main Drive"
      : folders.find((f) => f.id === destFolderId)?.name ||
        initialFolderName ||
        "Folder";

  useEffect(() => {
    const el = folderInputRef.current;
    if (el) el.setAttribute("webkitdirectory", "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/fs/list?folders=1`);
        const json = await res.json();
        if (!cancelled && res.ok) {
          setFolders((json.nodes as FsNode[]) ?? []);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function addFiles(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    setQueue((prev) => {
      const next = [...prev];
      const seen = new Set(prev.map((p) => p.key));
      incoming.forEach((file, i) => {
        const key = fileKey(file, prev.length + i);
        if (seen.has(key)) return;
        seen.add(key);
        next.push({ key, file });
      });
      return next;
    });
  }

  function removeQueued(key: string) {
    setQueue((prev) => prev.filter((p) => p.key !== key));
  }

  function addNames(raw: string, base: string[]): string[] {
    const parts = raw
      .split(/[,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
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

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!serverOnline) {
      setError("File server is offline — uploads are paused.");
      return;
    }
    if (queue.length === 0) {
      setError("Choose files or a folder to upload.");
      return;
    }
    const tagList = commitDraftTag();
    const viewHref = destFolderId
      ? `/?folder=${encodeURIComponent(destFolderId)}`
      : "/";
    const viewLabel = destFolderId
      ? `Main Drive / ${destFolderName}`
      : "Main Drive";

    setBusy(true);
    enqueueUploads(
      queue.map((item) => ({
        file: item.file,
        folderId: destFolderId,
        tags: tagList,
        description: description || null,
        createdBy: defaultCreatedBy || null,
        viewHref,
        viewLabel,
      })),
    );

    onStarted?.();
    onUploaded?.(undefined);
    onCancel();
  }

  return (
    <dialog
      className="modal modal-open"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="flat-scrim absolute inset-0 pointer-events-none" />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        onClick={(e) => e.stopPropagation()}
        className="modal-box flat-modal flat-modal--md flex flex-col max-h-[min(90vh,640px)]"
      >
        <header className="flat-modal-header">
          <div className="flat-modal-heading min-w-0">
            <h2 className="flat-modal-title">Upload</h2>
            <p className="flat-modal-desc truncate">
              To {destFolderId ? `Main Drive / ${destFolderName}` : "Main Drive"}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="flat-modal-close"
            disabled={busy}
            onClick={onCancel}
          >
            <IconX size={18} stroke={1.75} />
          </button>
        </header>

        <div className="flat-modal-body flex-1 overflow-y-auto">
          <div className="flex flex-col gap-1.5 mb-3">
            <span className="flat-modal-label">Upload to</span>
            <select
              className="select select-bordered w-full"
              value={destFolderId ?? ""}
              disabled={busy}
              onChange={(e) =>
                setDestFolderId(e.target.value ? e.target.value : null)
              }
            >
              <option value="">Main Drive (root)</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.relative_path || f.name}
                </option>
              ))}
            </select>
            <p className="type-caption text-[var(--ink-soft)]">
              Uploading to:{" "}
              <strong>
                {destFolderId
                  ? `Main Drive / ${destFolderName}`
                  : "Main Drive"}
              </strong>
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="flat-modal-label">Files</span>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                Choose files
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => folderInputRef.current?.click()}
              >
                <IconFolderPlus size={15} stroke={1.75} />
                Choose folder
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={folderInputRef}
              id={folderInputId}
              type="file"
              className="hidden"
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {queue.length > 0 ? (
              <ul className="mt-1 max-h-36 overflow-y-auto flex flex-col gap-1 surface-2 p-2">
                {queue.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center gap-2 type-caption text-[var(--ink)]"
                  >
                    <span
                      className="flex-1 truncate"
                      title={item.file.webkitRelativePath || item.file.name}
                    >
                      {item.file.webkitRelativePath || item.file.name}
                    </span>
                    <span className="shrink-0 text-[var(--ink-faint)]">
                      {formatBytes(item.file.size)}
                    </span>
                    <button
                      type="button"
                      className="flat-modal-close !w-6 !h-6"
                      disabled={busy}
                      aria-label={`Remove ${item.file.name}`}
                      onClick={() => removeQueued(item.key)}
                    >
                      <IconX size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="type-caption text-[var(--ink-faint)]">
                Select files or a folder.
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5 mt-3">
            <span className="flat-modal-label">Tags</span>
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
                      className="tag-chip gap-1"
                      style={chip.style}
                      disabled={busy}
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
                placeholder="Optional — Enter to add"
                className="flat-input flex-1"
                disabled={busy}
              />
              <Button
                variant="secondary"
                disabled={busy || !tagDraft.trim()}
                onClick={() => commitDraftTag()}
              >
                Add
              </Button>
            </div>
          </div>

          <label className="flat-modal-field mt-3">
            <span className="flat-modal-label">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flat-input"
              disabled={busy}
              placeholder="Optional"
            />
          </label>

          {error ? <p className="flat-modal-error">{error}</p> : null}
        </div>

        <footer className="flat-modal-footer">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={busy || !serverOnline || queue.length === 0}
          >
            {busy
              ? "Starting…"
              : queue.length > 1
                ? `Upload ${queue.length} files`
                : "Upload"}
          </Button>
        </footer>
      </form>
      <form method="dialog" className="modal-backdrop bg-transparent">
        <button type="button" disabled={busy} onClick={onCancel}>
          close
        </button>
      </form>
    </dialog>
  );
}
