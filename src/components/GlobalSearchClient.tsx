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
import { AssetCard } from "@/components/AssetCard";
import { Menu } from "@/components/ui/Menu";
import { Skeleton } from "@/components/ui/Skeleton";
import { useViewTransitionNavigate } from "@/components/ui/useViewTransitionNavigate";
import { assetMatchReason, isImageMime } from "@/lib/matchReason";
import type { FolderSearchHit } from "@/lib/search";
import type { Asset, Space } from "@/lib/types";

type GlobalSearchClientProps = {
  spaces: Space[];
};

export function GlobalSearchClient({ spaces }: GlobalSearchClientProps) {
  const navigate = useViewTransitionNavigate();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";
  const spaceFilter = searchParams.get("space") || "";

  const [assets, setAssets] = useState<Asset[]>([]);
  const [folders, setFolders] = useState<FolderSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spaceById = useMemo(
    () => new Map(spaces.map((b) => [b.id, b])),
    [spaces],
  );

  const load = useCallback(async () => {
    if (!q.trim()) {
      setAssets([]);
      setFolders([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: q.trim() });
      if (spaceFilter) params.set("space_id", spaceFilter);
      const res = await fetch(`/api/search?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Search failed");
      setAssets((json.documents ?? json.assets ?? []) as Asset[]);
      setFolders((json.folders ?? []) as FolderSearchHit[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setAssets([]);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  }, [q, spaceFilter]);

  useEffect(() => {
    const handle = window.setTimeout(() => void load(), 80);
    return () => window.clearTimeout(handle);
  }, [load]);

  const filteredAssets = useMemo(() => {
    if (!spaceFilter) return assets;
    return assets.filter((a) => a.space_id === spaceFilter);
  }, [assets, spaceFilter]);

  const filteredFolders = useMemo(() => {
    if (!spaceFilter) return folders;
    return folders.filter((f) => f.space_id === spaceFilter);
  }, [folders, spaceFilter]);

  const images = useMemo(
    () => filteredAssets.filter((a) => isImageMime(a.mime_type)),
    [filteredAssets],
  );
  const files = useMemo(
    () => filteredAssets.filter((a) => !isImageMime(a.mime_type)),
    [filteredAssets],
  );

  function openAsset(asset: Asset) {
    const space = asset.space_id ? spaceById.get(asset.space_id) : null;
    if (!space) return;
    const params = new URLSearchParams();
    if (asset.folder_id) params.set("folder", asset.folder_id);
    params.set("asset", asset.id);
    navigate(`/s/${space.slug}?${params.toString()}`);
  }

  function openFolder(folder: FolderSearchHit) {
    const slug =
      folder.space_slug ||
      (folder.space_id ? spaceById.get(folder.space_id)?.slug : null);
    if (!slug) return;
    navigate(`/s/${slug}?folder=${encodeURIComponent(folder.id)}`);
  }

  function setSpaceFilter(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("space", id);
    else params.delete("space");
    navigate(`/search?${params.toString()}`);
  }

  function AssetSection({
    title,
    items,
    icon,
  }: {
    title: string;
    items: Asset[];
    icon: ReactNode;
  }) {
    if (items.length === 0) return null;
    return (
      <section className="search-page-section">
        <h2 className="search-page-section-title">
          <span className="search-page-section-icon">{icon}</span>
          {title}
          <span className="search-page-count">{items.length}</span>
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
          {items.map((asset) => {
            const space = asset.space_id
              ? spaceById.get(asset.space_id)
              : null;
            return (
              <div key={asset.id} className="relative">
                <AssetCard
                  asset={asset}
                  locked={Boolean(asset.locked)}
                  spaceName={space?.name ?? null}
                  spaceColor={space?.color ?? null}
                  showSpace
                  thumbnailUrl={
                    !asset.locked && asset.has_thumbnail
                      ? `/api/media/thumbnail/${encodeURIComponent(asset.file_id)}`
                      : null
                  }
                  onClick={() => openAsset(asset)}
                />
                <span className="search-hit-chip search-hit-chip--overlay">
                  {assetMatchReason(q, asset)}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <div className="search-page">
      <div className="search-page-head">
        <div>
          <h1 className="type-page">Search</h1>
          <p className="type-caption mt-1">
            {q.trim()
              ? loading
                ? `Searching for “${q.trim()}”…`
                : `${filteredFolders.length} folders · ${images.length} images · ${files.length} files`
              : "Type in the bar above to search everything."}
          </p>
        </div>
        <Menu
          trigger={
            <span className="btn-flat inline-flex items-center gap-1.5 px-3 h-9 text-[13px]">
              <IconFilter size={15} stroke={1.75} />
              Filters
              {spaceFilter ? (
                <span className="text-[var(--accent)]">· 1</span>
              ) : null}
            </span>
          }
          widthClass="w-[220px]"
        >
          <p className="type-label px-2.5 pt-1 pb-1">Space</p>
          <button
            type="button"
            className="menu-row"
            onClick={() => setSpaceFilter("")}
          >
            All spaces
          </button>
          {spaces.map((s) => (
            <button
              key={s.id}
              type="button"
              className="menu-row"
              onClick={() => setSpaceFilter(s.id)}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="truncate flex-1">{s.name}</span>
              {spaceFilter === s.id ? (
                <span className="text-[var(--accent)] text-[11px]">✓</span>
              ) : null}
            </button>
          ))}
        </Menu>
      </div>

      {error ? (
        <p className="type-caption text-[var(--danger)]">{error}</p>
      ) : null}

      {loading ? <Skeleton rows={4} className="mt-2" /> : null}

      {!loading &&
      q.trim() &&
      filteredAssets.length === 0 &&
      filteredFolders.length === 0 ? (
        <div className="surface empty-state">
          <p className="type-title">No results</p>
          <p className="type-caption mt-2">
            Nothing matched “{q.trim()}”. Try a folder name, file title, or tag.
          </p>
        </div>
      ) : null}

      {!loading ? (
        <div className="search-page-body">
          {filteredFolders.length > 0 ? (
            <section className="search-page-section">
              <h2 className="search-page-section-title">
                <span className="search-page-section-icon">
                  <IconFolder size={15} stroke={1.75} />
                </span>
                Folders
                <span className="search-page-count">
                  {filteredFolders.length}
                </span>
              </h2>
              <div className="search-folder-list">
                {filteredFolders.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="search-folder-row"
                    onClick={() => openFolder(f)}
                  >
                    <IconFolder
                      size={16}
                      stroke={1.75}
                      className="text-[var(--ink-faint)] shrink-0"
                    />
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          f.space_color ||
                          spaceById.get(f.space_id)?.color ||
                          "#8e8e93",
                      }}
                    />
                    <span className="flex-1 truncate text-left type-body font-medium">
                      {f.name}
                    </span>
                    <span className="type-caption truncate max-w-[8rem]">
                      {f.space_name || spaceById.get(f.space_id)?.name || ""}
                    </span>
                    <span className="search-hit-chip">Folder</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <AssetSection
            title="Images"
            items={images}
            icon={<IconPhoto size={15} stroke={1.75} />}
          />
          <AssetSection
            title="Files"
            items={files}
            icon={<IconFile size={15} stroke={1.75} />}
          />
        </div>
      ) : null}
    </div>
  );
}
