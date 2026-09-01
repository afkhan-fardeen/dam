"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "next/navigation";
import { IconFilter, IconFolder, IconPhoto, IconFile } from "@tabler/icons-react";
import { Menu } from "@/components/ui/Menu";
import { Skeleton } from "@/components/ui/Skeleton";
import { useViewTransitionNavigate } from "@/components/ui/useViewTransitionNavigate";
import type { FsNode, Space } from "@/lib/types";

type GlobalSearchClientProps = {
  spaces: Space[];
};

function isImageMime(mime: string | null | undefined): boolean {
  return Boolean(mime && mime.startsWith("image/"));
}

export function GlobalSearchClient({ spaces }: GlobalSearchClientProps) {
  const navigate = useViewTransitionNavigate();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";
  const spaceFilter = searchParams.get("space") || "";

  const [nodes, setNodes] = useState<FsNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spaceById = useMemo(
    () => new Map(spaces.map((b) => [b.id, b])),
    [spaces],
  );

  const load = useCallback(async () => {
    if (!q.trim()) {
      setNodes([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: q.trim() });
      if (spaceFilter) params.set("space_id", spaceFilter);
      const res = await fetch(`/api/fs/search?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Search failed");
      setNodes((json.nodes as FsNode[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setNodes([]);
    } finally {
      setLoading(false);
    }
  }, [q, spaceFilter]);

  useEffect(() => {
    const handle = window.setTimeout(() => void load(), 80);
    return () => window.clearTimeout(handle);
  }, [load]);

  const filtered = useMemo(() => nodes, [nodes]);

  const folders = useMemo(
    () => filtered.filter((n) => n.node_type === "folder"),
    [filtered],
  );
  const files = useMemo(
    () => filtered.filter((n) => n.node_type === "file"),
    [filtered],
  );
  const images = useMemo(
    () => files.filter((n) => isImageMime(n.mime_type)),
    [files],
  );
  const other = useMemo(
    () => files.filter((n) => !isImageMime(n.mime_type)),
    [files],
  );

  function openNode(node: FsNode) {
    if (node.node_type === "folder") {
      navigate(`/?folder=${encodeURIComponent(node.id)}`);
    } else if (node.parent_id) {
      navigate(`/?folder=${encodeURIComponent(node.parent_id)}`);
    } else {
      navigate(`/`);
    }
  }

  function Section({
    title,
    icon,
    children,
  }: {
    title: string;
    icon: ReactNode;
    children: ReactNode;
  }) {
    return (
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-base-content/70">
          {icon}
          {title}
        </h2>
        {children}
      </section>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Search</h1>
          <p className="text-sm text-base-content/60">
            {q.trim()
              ? loading
                ? "Searching…"
                : `${filtered.length} result${filtered.length === 1 ? "" : "s"} for “${q.trim()}”`
              : "Type a query in the top bar."}
          </p>
        </div>
        <Menu
          trigger={
            <button type="button" className="btn btn-ghost btn-sm gap-2">
              <IconFilter size={16} />
              {spaceFilter
                ? spaces.find((s) => s.id === spaceFilter)?.name || "Space"
                : "All spaces"}
            </button>
          }
        >
          <ul className="menu p-1">
            <li>
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  params.delete("space");
                  navigate(`/search?${params.toString()}`);
                }}
              >
                All spaces
              </button>
            </li>
            {spaces.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("space", s.id);
                    navigate(`/search?${params.toString()}`);
                  }}
                >
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        </Menu>
      </div>

      {error ? (
        <div className="alert alert-error text-sm">
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : !q.trim() ? null : filtered.length === 0 ? (
        <div className="rounded-box border border-base-300/60 bg-base-100 p-10 text-center text-sm text-base-content/60">
          No matches.
        </div>
      ) : (
        <>
          {folders.length > 0 ? (
            <Section title="Folders" icon={<IconFolder size={16} />}>
              <ul className="divide-y divide-base-300/50 rounded-box border border-base-300/60 bg-base-100">
                {folders.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-base-200/60"
                      onClick={() => openNode(n)}
                    >
                      <IconFolder size={18} className="shrink-0 opacity-60" />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {n.name}
                      </span>
                      <span className="text-xs text-base-content/50">
                        {n.relative_path}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}

          {images.length > 0 ? (
            <Section title="Images" icon={<IconPhoto size={16} />}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {images.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="overflow-hidden rounded-box border border-base-300/60 bg-base-100 text-left"
                    onClick={() => openNode(n)}
                  >
                    <div className="aspect-square bg-base-200">
                      {n.has_thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/fs/media/thumbnail/${n.id}`}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                    </div>
                    <div className="truncate p-2 text-sm">{n.name}</div>
                  </button>
                ))}
              </div>
            </Section>
          ) : null}

          {other.length > 0 ? (
            <Section title="Files" icon={<IconFile size={16} />}>
              <ul className="divide-y divide-base-300/50 rounded-box border border-base-300/60 bg-base-100">
                {other.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-base-200/60"
                      onClick={() => openNode(n)}
                    >
                      <IconFile size={18} className="shrink-0 opacity-60" />
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {n.name}
                      </span>
                      <span className="text-xs text-base-content/50">
                        {n.relative_path}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}
