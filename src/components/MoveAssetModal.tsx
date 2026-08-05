"use client";

import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import type { Folder } from "@/lib/types";

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
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="modal-box max-w-sm rounded-none"
      >
        <div className="flex items-start gap-2 mb-3">
          <h3 className="type-title flex-1">Move file</h3>
          <button
            type="button"
            aria-label="Close"
            className="btn btn-ghost btn-sm btn-square"
            onClick={onClose}
          >
            <IconX size={16} />
          </button>
        </div>
        <p className="type-caption opacity-60 mb-3 truncate" title={assetName}>
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
            className="select select-bordered select-sm w-full type-body"
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
        {error ? <p className="type-caption text-error mt-2">{error}</p> : null}
        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy || loading}
          >
            {busy ? "Moving…" : "Move"}
          </button>
        </div>
      </form>
      <form method="dialog" className="modal-backdrop">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
