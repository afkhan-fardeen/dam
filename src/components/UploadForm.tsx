"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconFolderPlus, IconX } from "@tabler/icons-react";
import { uploadFileWithProgress } from "@/lib/upload";
import { useDriveChrome } from "@/components/DriveChrome";
import { getTagChipStyles } from "@/lib/categories";
import {
  EntityPicker,
  type PickedEntity,
} from "@/components/EntityPicker";
import { GlassButton } from "@/components/glass/GlassButton";

type DestinationOption = {
  id: string;
  name: string;
};

type UploadFormProps = {
  spaceId: string;
  spaceName: string;
  folderId: string | null;
  folderName: string | null;
  defaultCreatedBy: string;
  /** Editable places when destination can be switched (e.g. from Home). */
  destinationOptions?: DestinationOption[];
  onDestinationChange?: (spaceId: string) => void;
  onUploaded: (assetIds?: string[]) => void;
  onCancel: () => void;
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
  spaceId,
  spaceName,
  folderId,
  folderName,
  defaultCreatedBy,
  destinationOptions,
  onDestinationChange,
  onUploaded,
  onCancel,
  initialFile = null,
}: UploadFormProps) {
  const { upsertJob, removeJob, serverOnline } = useDriveChrome();
  const [queue, setQueue] = useState<QueuedFile[]>(() =>
    initialFile
      ? [{ key: fileKey(initialFile, 0), file: initialFile }]
      : [],
  );
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [entities, setEntities] = useState<PickedEntity[]>([]);
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [createdBy, setCreatedBy] = useState(defaultCreatedBy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inheritedBrand, setInheritedBrand] = useState<string | null>(null);
  const [inheritedTags, setInheritedTags] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [doneCount, setDoneCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const folderInputId = useId();

  useEffect(() => {
    const el = folderInputRef.current;
    if (el) el.setAttribute("webkitdirectory", "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setInheritedBrand(null);
    setInheritedTags([]);
    void (async () => {
      try {
        const params = new URLSearchParams({ space_id: spaceId });
        if (folderId) params.set("folder_id", folderId);
        const res = await fetch(`/api/folders/effective?${params}`);
        const json = await res.json();
        if (!res.ok || cancelled) return;
        const effective = json.effective as {
          brand?: string | null;
          tagNames?: string[];
        };
        const fromBrand = effective?.brand?.trim() || null;
        const fromTags = effective?.tagNames ?? [];
        if (fromBrand) {
          setInheritedBrand(fromBrand);
          setBrand((prev) => prev || fromBrand);
        }
        if (fromTags.length) {
          setInheritedTags(fromTags);
          setTags((prev) => {
            const next = [...prev];
            const seen = new Set(prev.map((t) => t.toLowerCase()));
            for (const name of fromTags) {
              if (seen.has(name.toLowerCase())) continue;
              seen.add(name.toLowerCase());
              next.push(name);
            }
            return next;
          });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spaceId, folderId]);

  function addFiles(list: FileList | File[] | null) {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    setQueue((prev) => {
      const next = [...prev];
      const seen = new Set(prev.map((q) => `${q.file.name}:${q.file.size}:${q.file.lastModified}`));
      for (const file of incoming) {
        const sig = `${file.name}:${file.size}:${file.lastModified}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        next.push({ key: fileKey(file, next.length), file });
      }
      return next;
    });
    setDoneCount(null);
    setError(null);
  }

  function removeQueued(key: string) {
    setQueue((prev) => prev.filter((q) => q.key !== key));
  }

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

  async function uploadOne(target: File, tagList: string[]): Promise<string | undefined> {
    const jobId = `${Date.now()}-${target.name}-${Math.random().toString(36).slice(2, 7)}`;
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
        brand: brand || null,
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

      if (asset?.id && entities.length > 0) {
        await Promise.all(
          entities.map((ent) =>
            fetch(`/api/assets/${asset.id}/entities`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ entity_id: ent.id }),
            }).catch(() => null),
          ),
        );
      }
      return asset?.id;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload failed. Try again.";
      upsertJob({
        id: jobId,
        name: target.name,
        progress: 0,
        kind: "upload",
        status: "error",
        error: message,
      });
      throw new Error(`${target.name}: ${message}`);
    }
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
    setBusy(true);
    setError(null);
    setDoneCount(null);

    const ids: string[] = [];
    try {
      for (const item of queue) {
        const id = await uploadOne(item.file, tagList);
        if (id) ids.push(id);
      }
      setDoneCount(queue.length);
      window.setTimeout(() => {
        onUploaded(ids.length ? ids : undefined);
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const destFolderLabel = folderId ? folderName || "Folder" : "Root";
  const inheritParts = [
    inheritedBrand ? inheritedBrand : null,
    inheritedTags.length ? inheritedTags.join(", ") : null,
  ].filter(Boolean) as string[];
  const canSwitchPlace =
    Boolean(destinationOptions?.length) && Boolean(onDestinationChange) && !folderId;

  return (
    <dialog
      className="modal modal-open"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <div className="glass-scrim absolute inset-0 pointer-events-none" />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        onClick={(e) => e.stopPropagation()}
        className="modal-box max-w-md p-0 flex flex-col max-h-[min(90vh,640px)] glass-content glass-appear !bg-[var(--content-glass)] border-0 shadow-none"
        style={{ borderRadius: 22 }}
      >
        <div className="shrink-0 flex items-start gap-2 px-5 pt-5 pb-2">
          <div className="flex-1 min-w-0">
            <h3 className="type-title">Upload</h3>
            <p className="type-caption mt-1 truncate">
              Uploading to {spaceName} / {destFolderLabel}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="dock-btn !px-2"
            disabled={busy}
            onClick={onCancel}
          >
            <IconX size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-3">
          {canSwitchPlace ? (
            <label className="flex flex-col gap-1.5">
              <span className="type-caption">Place</span>
              <select
                className="glass-input w-full type-body px-3 py-2 rounded-[12px] bg-white/55"
                value={spaceId}
                disabled={busy}
                onChange={(e) => onDestinationChange?.(e.target.value)}
              >
                {destinationOptions!.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span className="type-caption">Files</span>
            <div className="flex flex-wrap gap-2">
              <GlassButton
                variant="glass"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                Choose files
              </GlassButton>
              <GlassButton
                variant="glass"
                disabled={busy}
                onClick={() => folderInputRef.current?.click()}
              >
                <IconFolderPlus size={15} stroke={1.75} />
                Choose folder
              </GlassButton>
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
              <ul className="mt-1 max-h-36 overflow-y-auto flex flex-col gap-1 rounded-[12px] bg-white/40 p-2">
                {queue.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center gap-2 type-caption text-[var(--ink)]"
                  >
                    <span className="flex-1 truncate" title={item.file.webkitRelativePath || item.file.name}>
                      {item.file.webkitRelativePath || item.file.name}
                    </span>
                    <span className="shrink-0 text-[var(--ink-faint)]">
                      {formatBytes(item.file.size)}
                    </span>
                    <button
                      type="button"
                      className="dock-btn !px-1.5 !py-0.5"
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
                Select multiple files or an entire folder.
              </span>
            )}
          </div>

          {inheritParts.length > 0 ? (
            <div className="rounded-[12px] bg-white/40 px-3 py-2">
              <p className="type-caption text-[var(--ink-soft)]">
                From folder: {inheritParts.join(" · ")}
              </p>
              <p className="type-caption text-[var(--ink-faint)] mt-0.5">
                Edit brand or tags below before uploading.
              </p>
            </div>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="type-caption">Brand</span>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="glass-input w-full type-body px-3 py-2 rounded-[12px] bg-white/55"
              disabled={busy}
              placeholder="Optional"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="type-caption">Tags</span>
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
                placeholder="Type a tag, then Enter"
                className="glass-input flex-1 type-body px-3 py-2 rounded-[12px] bg-white/55"
                disabled={busy}
              />
              <GlassButton
                variant="glass"
                disabled={busy || !tagDraft.trim()}
                onClick={() => commitDraftTag()}
              >
                Add
              </GlassButton>
            </div>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="type-caption">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="glass-input w-full type-body px-3 py-2 rounded-[12px] bg-white/55"
              disabled={busy}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="type-caption">Credit</span>
            <input
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              className="glass-input w-full type-body px-3 py-2 rounded-[12px] bg-white/55"
              disabled={busy}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              className="type-caption text-left text-[var(--accent)] hover:opacity-80"
              disabled={busy}
              onClick={() => setMoreOpen((v) => !v)}
            >
              {moreOpen ? "Hide options" : "More options"}
            </button>
            {moreOpen ? (
              <EntityPicker
                selected={entities}
                onChange={setEntities}
                disabled={busy}
              />
            ) : null}
          </div>

          {error ? (
            <p className="type-caption text-[#ff3b30]">{error}</p>
          ) : null}
          {doneCount != null ? (
            <p className="type-caption text-[#34c759]">
              {doneCount} uploaded
            </p>
          ) : null}
        </div>

        <div className="shrink-0 flex justify-end gap-2 px-5 py-4">
          <GlassButton variant="glass" disabled={busy} onClick={onCancel}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            type="submit"
            disabled={busy || !serverOnline || queue.length === 0}
          >
            {busy
              ? "Uploading…"
              : queue.length > 1
                ? `Upload ${queue.length}`
                : "Upload"}
          </GlassButton>
        </div>
      </form>
      <form method="dialog" className="modal-backdrop bg-transparent">
        <button type="button" disabled={busy} onClick={onCancel}>
          close
        </button>
      </form>
    </dialog>
  );
}
