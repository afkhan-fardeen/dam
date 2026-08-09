"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconFolderPlus, IconX } from "@tabler/icons-react";
import { useDriveChrome } from "@/components/DriveChrome";
import { getTagChipStyles } from "@/lib/categories";
import {
  EntityPicker,
  type PickedEntity,
} from "@/components/EntityPicker";
import { Button } from "@/components/ui/Button";
import type { Folder } from "@/lib/types";

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
  /** Called as soon as upload work starts (close the modal) */
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
  spaceId: initialSpaceId,
  spaceName: initialSpaceName,
  spaceSlug: initialSpaceSlug,
  folderId: initialFolderId,
  folderName: initialFolderName,
  defaultCreatedBy,
  destinationOptions,
  onUploaded,
  onCancel,
  onStarted,
  initialFile = null,
}: UploadFormProps) {
  const { enqueueUploads, serverOnline, notifyLibraryChange } = useDriveChrome();
  const [destSpaceId, setDestSpaceId] = useState(initialSpaceId);
  const [destFolderId, setDestFolderId] = useState<string | null>(initialFolderId);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [createFolderBusy, setCreateFolderBusy] = useState(false);

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const folderInputId = useId();

  const destPlace =
    destinationOptions.find((d) => d.id === destSpaceId) ?? {
      id: destSpaceId,
      name: initialSpaceName,
      slug: initialSpaceSlug,
    };

  const destFolderName =
    destFolderId == null
      ? "Place root"
      : folders.find((f) => f.id === destFolderId)?.name ||
        (destFolderId === initialFolderId ? initialFolderName : null) ||
        "Folder";

  useEffect(() => {
    const el = folderInputRef.current;
    if (el) el.setAttribute("webkitdirectory", "");
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFoldersLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/folders?space_id=${destSpaceId}`);
        const json = await res.json();
        if (!cancelled && res.ok) {
          setFolders((json.folders as Folder[]) ?? []);
        }
      } finally {
        if (!cancelled) setFoldersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [destSpaceId]);

  useEffect(() => {
    let cancelled = false;
    setInheritedBrand(null);
    setInheritedTags([]);
    void (async () => {
      try {
        const params = new URLSearchParams({ space_id: destSpaceId });
        if (destFolderId) params.set("folder_id", destFolderId);
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
  }, [destSpaceId, destFolderId]);

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

  async function createFolderInline() {
    const name = newFolderName.trim();
    if (!name) return;
    setCreateFolderBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          space_id: destSpaceId,
          parent_folder_id: null,
          name,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not create folder.");
      const folder = json.folder as Folder;
      setFolders((prev) => [...prev, folder]);
      setDestFolderId(folder.id);
      setCreatingFolder(false);
      setNewFolderName("");
      notifyLibraryChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create folder.");
    } finally {
      setCreateFolderBusy(false);
    }
  }

  function viewHrefForDest(): string {
    const base = `/s/${destPlace.slug}`;
    return destFolderId
      ? `${base}?folder=${encodeURIComponent(destFolderId)}`
      : base;
  }

  function viewLabelForDest(): string {
    return destFolderId
      ? `${destPlace.name} / ${destFolderName}`
      : destPlace.name;
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
    if (creatingFolder) {
      setError("Create the folder first, or cancel creating one.");
      return;
    }
    const tagList = commitDraftTag();
    const viewHref = viewHrefForDest();
    const viewLabel = viewLabelForDest();
    const entityIds = entities.map((e) => e.id);

    // Hand off to the shell queue so uploads keep running after the modal
    // closes and while you navigate anywhere in the app.
    enqueueUploads(
      queue.map((item) => ({
        file: item.file,
        spaceId: destSpaceId,
        folderId: destFolderId,
        tags: tagList,
        description: description || null,
        brand: brand || null,
        createdBy: createdBy || null,
        entityIds,
        viewHref,
        viewLabel,
      })),
    );

    onStarted?.();
    onUploaded?.(undefined);
    onCancel();
  }

  const inheritParts = [
    inheritedBrand ? inheritedBrand : null,
    inheritedTags.length ? inheritedTags.join(", ") : null,
  ].filter(Boolean) as string[];

  const folderOptions = (() => {
    const byId = new Map(folders.map((f) => [f.id, f]));
    function pathOf(f: Folder): string {
      const parts = [f.name];
      let cur: Folder | undefined = f;
      while (cur?.parent_folder_id) {
        cur = byId.get(cur.parent_folder_id);
        if (!cur) break;
        parts.unshift(cur.name);
      }
      return parts.join(" / ");
    }
    return folders
      .slice()
      .sort((a, b) => pathOf(a).localeCompare(pathOf(b)))
      .map((f) => ({
        id: f.id,
        label: f.passcode_enabled ? `${pathOf(f)} (locked)` : pathOf(f),
      }));
  })();

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
              To {destPlace.name} / {destFolderName}
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
          <label className="flat-modal-field">
            <span className="flat-modal-label">Place</span>
            <select
              className="flat-input"
              value={destSpaceId}
              disabled={busy || destinationOptions.length <= 1}
              onChange={(e) => {
                setDestSpaceId(e.target.value);
                setDestFolderId(null);
                setCreatingFolder(false);
                setNewFolderName("");
              }}
            >
              {(destinationOptions.length
                ? destinationOptions
                : [destPlace]
              ).map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flat-modal-field">
            <span className="flat-modal-label">Folder</span>
            <select
              className="flat-input"
              value={creatingFolder ? "__new__" : (destFolderId ?? "")}
              disabled={busy || foldersLoading}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__new__") {
                  setCreatingFolder(true);
                  setDestFolderId(null);
                  return;
                }
                setCreatingFolder(false);
                setDestFolderId(v || null);
              }}
            >
              <option value="">Place root</option>
              {folderOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
              <option value="__new__">Create new folder…</option>
            </select>
          </label>

          {creatingFolder ? (
            <div className="flex gap-2 items-end">
              <label className="flat-modal-field flex-1">
                <span className="flat-modal-label">New folder name</span>
                <input
                  className="flat-input"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  disabled={busy || createFolderBusy}
                  autoFocus
                />
              </label>
              <Button
                variant="secondary"
                disabled={busy || createFolderBusy || !newFolderName.trim()}
                onClick={() => void createFolderInline()}
              >
                {createFolderBusy ? "Creating…" : "Create"}
              </Button>
            </div>
          ) : null}

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
                Select multiple files or an entire folder.
              </span>
            )}
          </div>

          {inheritParts.length > 0 ? (
            <div className="surface-2 px-3 py-2">
              <p className="type-caption text-[var(--ink-soft)]">
                From folder: {inheritParts.join(" · ")}
              </p>
            </div>
          ) : null}

          <label className="flat-modal-field">
            <span className="flat-modal-label">Brand</span>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="flat-input"
              disabled={busy}
              placeholder="Optional"
            />
          </label>

          <div className="flex flex-col gap-1.5">
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
                placeholder="Type a tag, then Enter"
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

          <label className="flat-modal-field">
            <span className="flat-modal-label">Description</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flat-input"
              disabled={busy}
            />
          </label>

          <label className="flat-modal-field">
            <span className="flat-modal-label">Credit</span>
            <input
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              className="flat-input"
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

          {error ? <p className="flat-modal-error">{error}</p> : null}
        </div>

        <footer className="flat-modal-footer">
          <Button variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={
              busy ||
              !serverOnline ||
              queue.length === 0 ||
              creatingFolder
            }
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
