"use client";

import { useEffect, useState } from "react";
import { IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/Button";

type ShareLinkModalProps = {
  assetId: string;
  assetName: string;
  onClose: () => void;
};

type LinkRow = {
  id: string;
  token: string;
  can_download: boolean;
  expires_at: string | null;
  has_password?: boolean;
};

export function ShareLinkModal({
  assetId,
  assetName,
  onClose,
}: ShareLinkModalProps) {
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [canDownload, setCanDownload] = useState(true);
  const [password, setPassword] = useState("");
  const [expiresDays, setExpiresDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/share-links?asset_id=${assetId}`);
    const json = await res.json();
    if (res.ok) setLinks((json.links ?? []) as LinkRow[]);
  }

  useEffect(() => {
    void load();
  }, [assetId]);

  async function createLink() {
    setBusy(true);
    setError(null);
    try {
      let expires_at: string | null = null;
      if (expiresDays.trim()) {
        const d = Number(expiresDays);
        if (!Number.isFinite(d) || d <= 0) {
          setError("Expiry must be a positive number of days.");
          setBusy(false);
          return;
        }
        expires_at = new Date(Date.now() + d * 86400000).toISOString();
      }
      const res = await fetch("/api/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset_id: assetId,
          can_download: canDownload,
          password: password || null,
          expires_at,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not create link");
      setPassword("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function shareUrl(token: string) {
    if (typeof window === "undefined") return `/share/${token}`;
    return `${window.location.origin}/share/${token}`;
  }

  return (
    <dialog className="modal modal-open" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <div className="flat-scrim absolute inset-0 pointer-events-none" />
      <div
        className="modal-box surface flat-fade max-w-md p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 pt-5 pb-2">
          <div className="flex-1 min-w-0">
            <h3 className="type-title">Share</h3>
            <p className="type-caption truncate">{assetName}</p>
          </div>
          <button type="button" className="btn-flat-ghost !px-2" onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </button>
        </div>
        <div className="px-5 py-3 flex flex-col gap-3">
          <label className="flex items-center gap-2 type-body">
            <input
              type="checkbox"
              checked={canDownload}
              onChange={(e) => setCanDownload(e.target.checked)}
            />
            Allow download
          </label>
          <label className="flex flex-col gap-1">
            <span className="type-caption">Password (optional)</span>
            <input
              className="flat-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="type-caption">Expires in days (optional)</span>
            <input
              className="flat-input"
              value={expiresDays}
              onChange={(e) => setExpiresDays(e.target.value)}
              placeholder="e.g. 7"
            />
          </label>
          {error ? (
            <p className="type-caption text-[var(--danger)]">{error}</p>
          ) : null}
          <Button variant="primary" disabled={busy} onClick={() => void createLink()}>
            {busy ? "Creating…" : "Create link"}
          </Button>
          {links.length > 0 ? (
            <ul className="flex flex-col gap-2 mt-2">
              {links.map((l) => (
                <li key={l.id} className="surface-2 p-2 flex flex-col gap-1">
                  <code className="type-caption break-all">{shareUrl(l.token)}</code>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      className="!h-8"
                      onClick={() => {
                        void navigator.clipboard.writeText(shareUrl(l.token));
                        setCopied(l.id);
                        window.setTimeout(() => setCopied(null), 1500);
                      }}
                    >
                      {copied === l.id ? "Copied" : "Copy"}
                    </Button>
                    <Button
                      variant="danger"
                      className="!h-8"
                      onClick={() => {
                        void fetch(`/api/share-links?id=${l.id}`, {
                          method: "DELETE",
                        }).then(() => load());
                      }}
                    >
                      Revoke
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop bg-transparent">
        <button type="button" onClick={onClose}>
          close
        </button>
      </form>
    </dialog>
  );
}
