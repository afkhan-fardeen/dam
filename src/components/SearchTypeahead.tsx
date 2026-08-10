"use client";

import { useEffect, useState, type ReactNode } from "react";
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

  function ResultRow({
    icon,
    title,
    meta,
    chip,
    onClick,
    thumb,
  }: {
    icon: ReactNode;
    title: string;
    meta?: string;
    chip?: string;
    onClick: () => void;
    thumb?: string | null;
  }) {
    return (
      <button type="button" role="option" className="search-hit" onClick={onClick}>
        <span className="search-hit-media">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" />
          ) : (
            icon
          )}
        </span>
        <span className="search-hit-copy">
          <span className="search-hit-title">{title}</span>
          {meta ? <span className="search-hit-meta">{meta}</span> : null}
        </span>
        {chip ? <span className="search-hit-chip">{chip}</span> : null}
      </button>
    );
  }

  return (
    <div
      className="absolute left-0 right-0 top-full mt-1.5 z-50 search-panel max-h-[min(70vh,440px)] overflow-y-auto"
      role="listbox"
      aria-label="Search suggestions"
    >
      {loading && assets.length === 0 && folders.length === 0 ? (
        <p className="search-panel-empty">Searching…</p>
      ) : null}

      {folders.length > 0 ? (
        <div className="search-panel-group">
          <p className="search-panel-label">Folders</p>
          {folders.map((f) => (
            <ResultRow
              key={f.id}
              icon={<IconFolder size={16} stroke={1.75} />}
              title={f.name}
              meta={f.space_name || undefined}
              chip="Folder"
              onClick={() => goFolder(f)}
            />
          ))}
        </div>
      ) : null}

      {images.length > 0 ? (
        <div className="search-panel-group">
          <p className="search-panel-label">Images</p>
          {images.map((a) => (
            <ResultRow
              key={a.id}
              icon={<IconPhoto size={16} stroke={1.75} />}
              title={a.original_name || "Untitled"}
              meta={
                a.space_id ? spaceById.get(a.space_id)?.name : undefined
              }
              chip={assetMatchReason(q, a)}
              thumb={
                a.has_thumbnail
                  ? `/api/media/thumbnail/${encodeURIComponent(a.file_id)}`
                  : null
              }
              onClick={() => goAsset(a)}
            />
          ))}
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="search-panel-group">
          <p className="search-panel-label">Files</p>
          {files.map((a) => (
            <ResultRow
              key={a.id}
              icon={<IconFile size={16} stroke={1.75} />}
              title={a.original_name || "Untitled"}
              meta={
                a.space_id ? spaceById.get(a.space_id)?.name : undefined
              }
              chip={assetMatchReason(q, a)}
              onClick={() => goAsset(a)}
            />
          ))}
        </div>
      ) : null}

      {!loading && folders.length === 0 && assets.length === 0 ? (
        <p className="search-panel-empty">No matches</p>
      ) : null}

      <button
        type="button"
        className="search-hit search-hit--all"
        onClick={() => {
          onSelect();
          navigate(`/search?q=${encodeURIComponent(q)}`);
        }}
      >
        <span className="search-hit-copy">
          <span className="search-hit-title">View all results for “{q}”</span>
        </span>
      </button>
    </div>
  );
}
