"use client";

import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { GlassButton } from "@/components/glass/GlassButton";
import { getTagChipStyles } from "@/lib/categories";
import type { Folder } from "@/lib/types";

type FolderMetaPanelProps = {
  folder: Folder;
  editable: boolean;
  onClose: () => void;
  onSaved: (folder: Folder) => void;
};

export function FolderMetaPanel({
  folder,
  editable,
  onClose,
  onSaved,
}: FolderMetaPanelProps) {
  const [description, setDescription] = useState(folder.description || "");
  const [notes, setNotes] = useState(folder.notes || "");
  const [brand, setBrand] = useState(folder.brand || "");
  const [tags, setTags] = useState<string[]>(
    (folder.tags ?? []).map((t) => t.name),
  );
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDescription(folder.description || "");
    setNotes(folder.notes || "");
    setBrand(folder.brand || "");
    setTags((folder.tags ?? []).map((t) => t.name));
  }, [folder]);

  function commitTag() {
    const name = tagDraft.trim();
    if (!name) return;
    if (!tags.some((t) => t.toLowerCase() === name.toLowerCase())) {
      setTags((prev) => [...prev, name]);
    }
    setTagDraft("");
  }

  async function save() {
    if (!editable) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: folder.id,
          description,
          notes,
          brand,
          tags,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save folder");
      onSaved(json.folder as Folder);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save folder");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside
      className="surface flat-fade fixed right-4 top-[68px] bottom-28 z-30 w-[min(100vw-2rem,20rem)] flex flex-col p-4 overflow-y-auto"
      style={{ borderRadius: 18 }}
    >
      <div className="flex items-start gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <p className="card-label">Folder</p>
          <h2 className="type-title truncate">{folder.name}</h2>
        </div>
        <button
          type="button"
          className="dock-btn !px-2"
          aria-label="Close"
          onClick={onClose}
        >
          <IconX size={15} />
        </button>
      </div>

      <label className="flex flex-col gap-1.5 mb-3">
        <span className="type-caption">Brand</span>
        <input
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          disabled={!editable || busy}
          className="glass-input w-full type-body px-3 py-2 rounded-[12px] bg-white/55"
          placeholder="Inherited by files unless overridden"
        />
      </label>

      <label className="flex flex-col gap-1.5 mb-3">
        <span className="type-caption">Description</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!editable || busy}
          rows={3}
          className="glass-input w-full type-body px-3 py-2 rounded-[12px] bg-white/55 resize-none"
        />
      </label>

      <div className="flex flex-col gap-1.5 mb-3">
        <span className="type-caption">Tags</span>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => {
              const chip = getTagChipStyles(t);
              return (
                <button
                  key={t}
                  type="button"
                  disabled={!editable || busy}
                  onClick={() =>
                    setTags((prev) => prev.filter((x) => x !== t))
                  }
                  className="tag-chip gap-1"
                  style={chip.style}
                >
                  {t}
                  {editable ? <IconX size={10} /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        {editable ? (
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onBlur={() => {
              if (tagDraft.trim()) commitTag();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commitTag();
              }
            }}
            placeholder="Add tag"
            className="glass-input w-full type-body px-3 py-2 rounded-[12px] bg-white/55"
            disabled={busy}
          />
        ) : null}
      </div>

      <label className="flex flex-col gap-1.5 mb-4">
        <span className="type-caption">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={!editable || busy}
          rows={3}
          className="glass-input w-full type-body px-3 py-2 rounded-[12px] bg-white/55 resize-none"
        />
      </label>

      {error ? (
        <p className="type-caption text-[#ff3b30] mb-3">{error}</p>
      ) : null}

      {editable ? (
        <div className="flex justify-end gap-2 mt-auto">
          <GlassButton variant="glass" disabled={busy} onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save"}
          </GlassButton>
        </div>
      ) : null}
    </aside>
  );
}
