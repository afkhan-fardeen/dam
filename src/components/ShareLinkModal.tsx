"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";

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
      setError(err instanceof Error ? err.message : "Could not create link.");
    } finally {
      setBusy(false);
    }
  }

  function shareUrl(token: string) {
    if (typeof window === "undefined") return `/share/${token}`;
    return `${window.location.origin}/share/${token}`;
  }

  return (
    <Modal
      title="Share link"
      description={assetName}
      onClose={onClose}
      size="md"
      closeDisabled={busy}
      footer={
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => void createLink()}
        >
          {busy ? "Creating…" : "Create link"}
        </Button>
      }
    >
      <label className="flex items-center gap-2 type-body">
        <input
          type="checkbox"
          checked={canDownload}
          onChange={(e) => setCanDownload(e.target.checked)}
        />
        Allow download
      </label>
      <label className="flat-modal-field">
        <span className="flat-modal-label">Password (optional)</span>
        <input
          className="flat-input"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      <label className="flat-modal-field">
        <span className="flat-modal-label">Expires in days (optional)</span>
        <input
          className="flat-input"
          value={expiresDays}
          onChange={(e) => setExpiresDays(e.target.value)}
          placeholder="e.g. 7"
          inputMode="numeric"
        />
      </label>
      {error ? <p className="flat-modal-error">{error}</p> : null}
      {links.length > 0 ? (
        <ul className="flex flex-col gap-2 mt-1">
          {links.map((l) => (
            <li key={l.id} className="surface-2 p-3 flex flex-col gap-2">
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
                  {copied === l.id ? "Copied" : "Copy link"}
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
    </Modal>
  );
}
