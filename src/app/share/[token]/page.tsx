"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type ShareAsset = {
  id: string;
  file_id: string;
  original_name: string | null;
  mime_type: string | null;
  has_thumbnail: boolean;
  description: string | null;
};

export default function SharePage() {
  const params = useParams();
  const token = String(params.token || "");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asset, setAsset] = useState<ShareAsset | null>(null);
  const [canDownload, setCanDownload] = useState(false);

  async function load(pw?: string) {
    setError(null);
    const qs = pw ? `?password=${encodeURIComponent(pw)}` : "";
    const res = await fetch(`/api/share/${encodeURIComponent(token)}${qs}`);
    const json = await res.json();
    if (res.status === 401 && json.needs_password) {
      setNeedsPassword(true);
      return;
    }
    if (!res.ok) {
      setError(json.error || "Could not open link");
      return;
    }
    setNeedsPassword(false);
    setAsset(json.asset as ShareAsset);
    setCanDownload(Boolean(json.can_download));
  }

  useEffect(() => {
    void load();
  }, [token]);

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4 py-10">
      <div className="surface w-full max-w-lg p-6 flex flex-col gap-4 flat-fade">
        <h1 className="type-page">Shared file</h1>
        {error ? (
          <p className="type-caption text-[var(--danger)]">{error}</p>
        ) : null}
        {needsPassword && !asset ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void load(password);
            }}
          >
            <p className="type-caption">This link is password protected.</p>
            <input
              type="password"
              className="flat-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
            <button type="submit" className="btn-flat-primary h-9">
              Unlock
            </button>
          </form>
        ) : null}
        {asset ? (
          <>
            <p className="type-title break-words">{asset.original_name}</p>
            {asset.description ? (
              <p className="type-caption">{asset.description}</p>
            ) : null}
            {asset.has_thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/share/${encodeURIComponent(token)}/media?kind=thumbnail${
                  password ? `&password=${encodeURIComponent(password)}` : ""
                }`}
                alt=""
                className="w-full max-h-80 object-contain bg-[var(--surface-2)] border border-[var(--line)]"
              />
            ) : null}
            {canDownload ? (
              <a
                className="btn-flat-primary h-9 inline-flex items-center justify-center"
                href={`/api/share/${encodeURIComponent(token)}/media?kind=asset${
                  password ? `&password=${encodeURIComponent(password)}` : ""
                }`}
              >
                Download
              </a>
            ) : (
              <p className="type-caption">View only</p>
            )}
          </>
        ) : !needsPassword && !error ? (
          <p className="type-caption">Loading…</p>
        ) : null}
      </div>
    </div>
  );
}
