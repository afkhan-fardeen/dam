"use client";

import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import type { Folder } from "@/lib/types";
import { GlassButton } from "@/components/glass/GlassButton";

type MoveAssetModalProps = {
  assetName: string;
  spaceId: string;
  currentFolderId: string | null;
  folders?: Folder[];
  busy?: boolean;
  onClose: () => void;
  onMove: (folderId: string | null) => void | Promise<void>;
};

/** Quick move dialog — pick folder without opening the file preview. */
export function MoveAssetModal({
  assetName,
  spaceId,
  currentFolderId,
  folders: foldersProp,
  busy = false,
  onClose,
  onMove,
}: MoveAssetModalProps) {
  const [folders, setFolders] = useState<Folder[]>(foldersProp ?? []);
  const [folderId, setFolderId] = useState<string | null>(currentFolderId);
  const [loading, setLoading] = useState(!foldersProp);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (foldersProp) {
      setFolders(foldersProp);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/folders?space_id=${encodeURIComponent(spaceId)}`,
        );
        const json = await res.json();
        if (!cancelled && res.ok) {
          setFolders((json.folders as Folder[]) ?? []);
        }
      } catch {
        if (!cancelled) setError("Could not load folders.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spaceId, foldersProp]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await onMove(folderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not move file.");
    }
  }

  return (
    <dialog
      className="modal modal-open"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="glass-scrim absolute inset-0 pointer-events-none" />
      <form
        onSubmit={(e) => void handleSubmit(e)}
        onClick={(e) => e.stopPropagation()}
        className="modal-box max-w-sm glass-content glass-appear !bg-[var(--content-glass)] border-0 shadow-none"
        style={{ borderRadius: 22 }}
      >
        <div className="flex items-start gap-2 mb-3">
          <h3 className="type-title flex-1">Move file</h3>
          <button
            type="button"
            aria-label="Close"
            className="dock-btn !px-2"
            onClick={onClose}
          >
            <IconX size={16} />
          </button>
        </div>
        <p className="type-caption mb-3 truncate" title={assetName}>
          {assetName}
        </p>
        {loading ? (
          <div className="flex justify-center py-6">
            <span className="glass-shimmer inline-block h-4 w-4 rounded-full" />
          </div>
        ) : (
          <select
            value={folderId ?? ""}
            onChange={(e) => setFolderId(e.target.value || null)}
            className="select select-bordered select-sm w-full type-body bg-white/70 border-[var(--line)]"
            autoFocus
          >
            <option value="">Space root</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.passcode_enabled ? `${f.name} (locked)` : f.name}
              </option>
            ))}
          </select>
        )}
        {error ? (
          <p className="type-caption text-[#ff3b30] mt-2">{error}</p>
        ) : null}
        <div className="flex justify-end gap-2 mt-5">
          <GlassButton variant="glass" disabled={busy} onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton
            variant="primary"
            type="submit"
            disabled={busy || loading}
          >
            {busy ? "Moving…" : "Move"}
          </GlassButton>
        </div>
      </form>
      <form method="dialog" className="modal-backdrop bg-transparent">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
