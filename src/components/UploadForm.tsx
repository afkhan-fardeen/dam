"use client";

import { useEffect, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { uploadFileWithProgress } from "@/lib/upload";
import { useDriveChrome } from "@/components/DriveChrome";
import { getTagChipStyles } from "@/lib/categories";
import {
  EntityPicker,
  type PickedEntity,
} from "@/components/EntityPicker";
import { GlassButton } from "@/components/glass/GlassButton";

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
  const [entities, setEntities] = useState<PickedEntity[]>([]);
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState("");
  const [createdBy, setCreatedBy] = useState(defaultCreatedBy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inheritHint, setInheritHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
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
        if (effective?.brand) setBrand(effective.brand);
        if (effective?.tagNames?.length) {
          setTags((prev) => {
            const next = [...prev];
            const seen = new Set(prev.map((t) => t.toLowerCase()));
            for (const name of effective.tagNames!) {
              if (seen.has(name.toLowerCase())) continue;
              seen.add(name.toLowerCase());
              next.push(name);
            }
            return next;
          });
          setInheritHint("Brand and tags filled from this folder.");
        } else if (effective?.brand) {
          setInheritHint("Brand filled from this folder.");
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spaceId, folderId]);

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
      <div className="glass-scrim absolute inset-0 pointer-events-none" />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        onClick={(e) => e.stopPropagation()}
        className="modal-box max-w-md p-0 flex flex-col max-h-[min(90vh,560px)] glass-content glass-appear !bg-[var(--content-glass)] border-0 shadow-none"
        style={{ borderRadius: 22 }}
      >
        <div className="shrink-0 flex items-center gap-2 px-5 pt-5 pb-2">
          <h3 className="type-title flex-1">Upload file</h3>
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
          <label className="flex flex-col gap-1.5">
            <span className="type-caption">File</span>
            <input
              ref={inputRef}
              type="file"
              className="file-input file-input-bordered file-input-sm w-full type-body bg-white/70 border-[var(--line)]"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              autoFocus
            />
            {file ? (
              <span className="type-caption text-[#34c759] truncate">
                {file.name}
              </span>
            ) : null}
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

          <EntityPicker
            selected={entities}
            onChange={setEntities}
            disabled={busy}
          />

          {inheritHint ? (
            <p className="type-caption text-[var(--ink-faint)]">{inheritHint}</p>
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

          {error ? (
            <p className="type-caption text-[#ff3b30]">{error}</p>
          ) : null}
        </div>

        <div className="shrink-0 flex justify-end gap-2 px-5 py-4">
          <GlassButton variant="glass" disabled={busy} onClick={onCancel}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            type="submit"
            disabled={busy || !serverOnline}
          >
            {busy ? "Uploading…" : "Upload"}
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
