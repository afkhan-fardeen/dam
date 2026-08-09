"use client";

import { useEffect, useState } from "react";
import { IconFolder, IconPhoto, IconFile } from "@tabler/icons-react";
import { useViewTransitionNavigate } from "@/components/ui/useViewTransitionNavigate";
import { assetMatchReason, isImageMime } from "@/lib/matchReason";
import type { FolderSearchHit } from "@/lib/search";
import type { Asset, Space } from "@/lib/types";

type SearchTypeaheadProps = {
  query: string;
  onClose: () => void;
  onSelect: () => void;
  spaces?: Space[];
};

export function SearchTypeahead({
  query,
  onClose,
  onSelect,
  spaces = [],
}: SearchTypeaheadProps) {
  const navigate = useViewTransitionNavigate();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<FolderSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const spaceById = new Map(spaces.map((s) => [s.id, s]));

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setAssets([]);
      setFolders([]);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      setLoading(true);
      void (async () => {
        try {
          const res = await fetch(
            `/api/search?q=${encodeURIComponent(q)}&limit=8`,
          );
          const json = await res.json();
          if (!res.ok || cancelled) return;
          setAssets((json.documents ?? json.assets ?? []).slice(0, 6) as Asset[]);
          setFolders((json.folders ?? []).slice(0, 4) as FolderSearchHit[]);
        } catch {
          if (!cancelled) {
            setAssets([]);
            setFolders([]);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const q = query.trim();
  if (q.length < 2) return null;

  const images = assets.filter((a) => isImageMime(a.mime_type));
  const files = assets.filter((a) => !isImageMime(a.mime_type));

  function goAsset(asset: Asset) {
    onSelect();
    const space = asset.space_id ? spaceById.get(asset.space_id) : null;
    if (space) {
      const params = new URLSearchParams();
      if (asset.folder_id) params.set("folder", asset.folder_id);
      params.set("asset", asset.id);
      navigate(`/s/${space.slug}?${params.toString()}`);
      return;
    }
    navigate(`/search?q=${encodeURIComponent(q)}`);
  }

  function goFolder(folder: FolderSearchHit) {
    onSelect();
    if (folder.space_slug) {
      navigate(`/s/${folder.space_slug}?folder=${encodeURIComponent(folder.id)}`);
    }
  }

  return (
    <div
      className="absolute left-0 right-0 top-full mt-1 z-50 surface flat-sheet max-h-[min(70vh,420px)] overflow-y-auto p-1 search-results-stagger"
      role="listbox"
      aria-label="Search suggestions"
    >
      {loading && assets.length === 0 && folders.length === 0 ? (
        <p className="type-caption px-3 py-3">Searching…</p>
      ) : null}

      {folders.length > 0 ? (
        <div>
          <p className="type-label px-3 py-2">Folders</p>
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              role="option"
              className="menu-row"
              onClick={() => goFolder(f)}
            >
              <IconFolder size={16} className="text-[var(--ink-faint)]" />
              <span className="flex-1 truncate type-body">{f.name}</span>
              <span className="match-chip">Folder</span>
            </button>
          ))}
        </div>
      ) : null}

      {images.length > 0 ? (
        <div>
          <p className="type-label px-3 py-2">Images</p>
          {images.map((a) => (
            <button
              key={a.id}
              type="button"
              role="option"
              className="menu-row"
              onClick={() => goAsset(a)}
            >
              <IconPhoto size={16} className="text-[var(--ink-faint)]" />
              <span className="flex-1 truncate type-body">
                {a.original_name}
              </span>
              <span className="match-chip">{assetMatchReason(q, a)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {files.length > 0 ? (
        <div>
          <p className="type-label px-3 py-2">Files</p>
          {files.map((a) => (
            <button
              key={a.id}
              type="button"
              role="option"
              className="menu-row"
              onClick={() => goAsset(a)}
            >
              <IconFile size={16} className="text-[var(--ink-faint)]" />
              <span className="flex-1 truncate type-body">
                {a.original_name}
              </span>
              <span className="match-chip">{assetMatchReason(q, a)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!loading &&
      folders.length === 0 &&
      assets.length === 0 ? (
        <p className="type-caption px-3 py-3">No matches</p>
      ) : null}

      <button
        type="button"
        className="menu-row text-[var(--accent)]"
        onClick={() => {
          onSelect();
          navigate(`/search?q=${encodeURIComponent(q)}`);
        }}
      >
        View all results for “{q}”
      </button>
    </div>
  );
}
