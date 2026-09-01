"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconFolder, IconPhoto, IconFile } from "@tabler/icons-react";
import { useViewTransitionNavigate } from "@/components/ui/useViewTransitionNavigate";
import type { FsNode, Space } from "@/lib/types";

type SearchTypeaheadProps = {
  query: string;
  onClose: () => void;
  onSelect: () => void;
  spaces?: Space[];
};

function isImageMime(mime: string | null | undefined): boolean {
  return Boolean(mime && mime.startsWith("image/"));
}

export function SearchTypeahead({
  query,
  onClose,
  onSelect,
  spaces = [],
}: SearchTypeaheadProps) {
  const navigate = useViewTransitionNavigate();
  const [nodes, setNodes] = useState<FsNode[]>([]);
  const [loading, setLoading] = useState(false);
  const spaceById = new Map(spaces.map((s) => [s.id, s]));

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setNodes([]);
      return;
    }
    let cancelled = false;
    const id = window.setTimeout(() => {
      setLoading(true);
      void (async () => {
        try {
          const res = await fetch(
            `/api/fs/search?q=${encodeURIComponent(q)}`,
          );
          const json = await res.json();
          if (!res.ok || cancelled) return;
          setNodes(((json.nodes as FsNode[]) ?? []).slice(0, 10));
        } catch {
          if (!cancelled) setNodes([]);
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

  const folders = nodes.filter((n) => n.node_type === "folder").slice(0, 4);
  const files = nodes.filter((n) => n.node_type === "file");
  const images = files.filter((n) => isImageMime(n.mime_type)).slice(0, 6);
  const other = files.filter((n) => !isImageMime(n.mime_type)).slice(0, 6);

  function goNode(node: FsNode) {
    onSelect();
    const space = spaceById.get(node.space_id);
    if (!space) {
      navigate(`/search?q=${encodeURIComponent(q)}`);
      return;
    }
    if (node.node_type === "folder") {
      navigate(`/s/${space.slug}?folder=${encodeURIComponent(node.id)}`);
      return;
    }
    const params = new URLSearchParams();
    if (node.parent_id) params.set("folder", node.parent_id);
    navigate(`/s/${space.slug}?${params.toString()}`);
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
      {loading && nodes.length === 0 ? (
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
              meta={spaceById.get(f.space_id)?.name}
              chip="Folder"
              onClick={() => goNode(f)}
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
              title={a.name}
              meta={spaceById.get(a.space_id)?.name}
              thumb={
                a.has_thumbnail
                  ? `/api/fs/media/thumbnail/${encodeURIComponent(a.id)}`
                  : null
              }
              onClick={() => goNode(a)}
            />
          ))}
        </div>
      ) : null}

      {other.length > 0 ? (
        <div className="search-panel-group">
          <p className="search-panel-label">Files</p>
          {other.map((a) => (
            <ResultRow
              key={a.id}
              icon={<IconFile size={16} stroke={1.75} />}
              title={a.name}
              meta={spaceById.get(a.space_id)?.name}
              onClick={() => goNode(a)}
            />
          ))}
        </div>
      ) : null}

      {!loading && nodes.length === 0 ? (
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
