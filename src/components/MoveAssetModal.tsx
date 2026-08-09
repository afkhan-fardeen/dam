"use client";

import { useEffect, useState } from "react";
import type { Folder } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

type MoveAssetModalProps = {
  assetName: string;
  spaceId: string;
  currentFolderId: string | null;
  folders?: Folder[];
  busy?: boolean;
  onClose: () => void;
  onMove: (folderId: string | null) => void | Promise<void>;
};

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
    <Modal
      title="Move file"
      description={assetName}
      onClose={onClose}
      closeDisabled={busy}
      onSubmit={(e) => void handleSubmit(e)}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={busy || loading}>
            {busy ? "Moving…" : "Move here"}
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="type-caption">Loading folders…</p>
      ) : (
        <label className="flat-modal-field">
          <span className="flat-modal-label">Destination</span>
          <select
            value={folderId ?? ""}
            onChange={(e) => setFolderId(e.target.value || null)}
            className="flat-input"
            autoFocus
          >
            <option value="">Place root</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.passcode_enabled ? `${f.name} (locked)` : f.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error ? <p className="flat-modal-error">{error}</p> : null}
    </Modal>
  );
}
