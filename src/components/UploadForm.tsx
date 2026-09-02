"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
  initialFiles?: File[];
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
  return `${file.webkitRelativePath || file.name}:${file.size}:${file.lastModified}:${index}`;
}

function parentDir(relativePath: string): string {
  const norm = relativePath.replace(/\\/g, "/");
  const i = norm.lastIndexOf("/");
  return i > 0 ? norm.slice(0, i) : "";
}

export function UploadForm({
  folderId: initialFolderId,
  folderName: initialFolderName,
  defaultCreatedBy,
  onUploaded,
  onCancel,
  onStarted,
  initialFile = null,
  initialFiles = [],
}: UploadFormProps) {
  const {
    enqueueUploads,
    serverOnline,
    pendingUploadFiles,
    clearPendingUploadFiles,
  } = useDriveChrome();
  const [destFolderId, setDestFolderId] = useState<string | null>(initialFolderId);
  const [folders, setFolders] = useState<FsNode[]>([]);

  useEffect(() => {
    setDestFolderId(initialFolderId);
  }, [initialFolderId]);

  const seedFiles = useMemo(() => {
    const list: File[] = [];
    if (initialFile) list.push(initialFile);
    for (const f of initialFiles) list.push(f);
    for (const f of pendingUploadFiles) list.push(f);
    return list;
  }, [initialFile, initialFiles, pendingUploadFiles]);

  const [queue, setQueue] = useState<QueuedFile[]>(() =>
    seedFiles.map((file, i) => ({ key: fileKey(file, i), file })),
  );
  const [displayName, setDisplayName] = useState(
    () => (seedFiles.length === 1 ? seedFiles[0]!.name : ""),
  );
  const [folderDisplayName, setFolderDisplayName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const folderInputId = useId();
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || seedFiles.length === 0) return;
    seededRef.current = true;
    setQueue(seedFiles.map((file, i) => ({ key: fileKey(file, i), file })));
    if (seedFiles.length === 1) setDisplayName(seedFiles[0]!.name);
    const root = seedFiles
      .map((f) => (f.webkitRelativePath || "").split("/")[0])
      .find(Boolean);
    if (root) setFolderDisplayName(root);
    clearPendingUploadFiles();
  }, [seedFiles, clearPendingUploadFiles]);

  const destFolderName =
    destFolderId == null
      ? "Main Drive"
      : folders.find((f) => f.id === destFolderId)?.name ||
        initialFolderName ||
        "Folder";

  const isFolderUpload = queue.some((q) =>
    Boolean(q.file.webkitRelativePath && q.file.webkitRelativePath.includes("/")),
  );
  const singleFile = !isFolderUpload && queue.length === 1;

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
    if (incoming.length === 1 && !incoming[0]!.webkitRelativePath) {
      setDisplayName(incoming[0]!.name);
    }
    const root = incoming
      .map((f) => (f.webkitRelativePath || "").split("/")[0])
      .find(Boolean);
    if (root) setFolderDisplayName((prev) => prev || root);
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

  async function ensureFolderPath(
    parentId: string | null,
    path: string,
    meta?: { name?: string; tags?: string[]; description?: string | null },
  ): Promise<string> {
    const res = await fetch("/api/fs/ensure-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parent_id: parentId,
        path,
        name: meta?.name,
        tags: meta?.tags ?? [],
        description: meta?.description ?? null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Could not create folders");
    return json.folder_id as string;
  }

  async function handleSubmit(event: React.FormEvent) {
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
    setError(null);

    try {
      if (isFolderUpload) {
        const rootFromFiles =
          queue
            .map((q) => (q.file.webkitRelativePath || "").split("/")[0])
            .find(Boolean) || "Upload";
        const rootName = folderDisplayName.trim() || rootFromFiles;

        const dirSet = new Set<string>();
        for (const item of queue) {
          const rel = item.file.webkitRelativePath || item.file.name;
          const parts = rel.replace(/\\/g, "/").split("/").filter(Boolean);
          if (parts.length === 0) continue;
          parts[0] = rootName;
          for (let i = 1; i < parts.length; i++) {
            dirSet.add(parts.slice(0, i).join("/"));
          }
        }

        const dirs = [...dirSet].sort(
          (a, b) => a.split("/").length - b.split("/").length,
        );
        const folderIds = new Map<string, string>();

        for (const dir of dirs) {
          const isRoot = !dir.includes("/");
          const id = await ensureFolderPath(
            destFolderId,
            dir,
            isRoot
              ? {
                  name: rootName,
                  tags: tagList,
                  description: description || null,
                }
              : undefined,
          );
          folderIds.set(dir, id);
        }

        enqueueUploads(
          queue.map((item) => {
            const rel = (item.file.webkitRelativePath || item.file.name).replace(
              /\\/g,
              "/",
            );
            const parts = rel.split("/").filter(Boolean);
            if (parts.length > 0) parts[0] = rootName;
            const parentPath = parts.slice(0, -1).join("/");
            const parentId = parentPath
              ? folderIds.get(parentPath) ?? destFolderId
              : destFolderId;
            return {
              file: item.file,
              folderId: parentId,
              displayName: parts[parts.length - 1] || item.file.name,
              tags: [],
              description: null,
              createdBy: defaultCreatedBy || null,
              viewHref,
              viewLabel,
            };
          }),
        );
      } else {
        enqueueUploads(
          queue.map((item, index) => ({
            file: item.file,
            folderId: destFolderId,
            displayName:
              singleFile && displayName.trim()
                ? displayName.trim()
                : item.file.name,
            tags: tagList,
            description: description || null,
            createdBy: defaultCreatedBy || null,
            viewHref,
            viewLabel,
          })),
        );
      }

      onStarted?.();
      onUploaded?.(undefined);
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setBusy(false);
    }
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
              className="xp-search w-full"
              style={{ width: "100%", height: 36 }}
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
                Select files or a folder (nested folders are preserved).
              </span>
            )}
          </div>

          {singleFile ? (
            <div className="flex flex-col gap-1.5 mt-3">
              <span className="flat-modal-label">File name</span>
              <input
                className="xp-search w-full"
                style={{ width: "100%" }}
                value={displayName}
                disabled={busy}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          ) : null}

          {isFolderUpload ? (
            <div className="flex flex-col gap-1.5 mt-3">
              <span className="flat-modal-label">Folder name</span>
              <input
                className="xp-search w-full"
                style={{ width: "100%" }}
                value={folderDisplayName}
                disabled={busy}
                placeholder="Top-level folder name"
                onChange={(e) => setFolderDisplayName(e.target.value)}
              />
              <p className="type-caption text-[var(--ink-soft)]">
                Nested folders stay intact. Tags and description apply to this
                top folder only.
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5 mt-3">
            <span className="flat-modal-label">Tags</span>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const chip = getTagChipStyles(t);
                  return (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] border border-[var(--win-border)]"
                      style={chip.style}
                    >
                      {t}
                      <button
                        type="button"
                        className="opacity-60 hover:opacity-100"
                        disabled={busy}
                        aria-label={`Remove ${t}`}
                        onClick={() =>
                          setTags((prev) => prev.filter((x) => x !== t))
                        }
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : null}
            <input
              className="xp-search w-full"
              style={{ width: "100%" }}
              value={tagDraft}
              disabled={busy}
              placeholder="Optional — Enter to add"
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitDraftTag();
                }
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5 mt-3">
            <span className="flat-modal-label">Description</span>
            <textarea
              className="xp-details-textarea"
              rows={3}
              value={description}
              disabled={busy}
              placeholder={
                isFolderUpload
                  ? "Applies to the top folder"
                  : "Optional description"
              }
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {error ? (
            <p className="mt-3 text-[12px] text-[var(--danger)]">{error}</p>
          ) : null}
        </div>

        <footer className="flat-modal-footer">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || queue.length === 0} type="submit">
            {busy ? "Starting…" : `Upload${queue.length ? ` (${queue.length})` : ""}`}
          </Button>
        </footer>
      </form>
    </dialog>
  );
}

void parentDir;
