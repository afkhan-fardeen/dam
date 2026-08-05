"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IconFilter } from "@tabler/icons-react";
import { AssetCard } from "@/components/AssetCard";
import { entityTypeColor } from "@/components/EntityChip";
import { GlassDropdown } from "@/components/glass/GlassDropdown";
import { GlassSkeleton } from "@/components/glass/GlassSkeleton";
import { useViewTransitionNavigate } from "@/components/glass/useViewTransitionNavigate";
import type { Asset, Entity, Space } from "@/lib/types";

type GlobalSearchClientProps = {
  spaces: Space[];
};

export function GlobalSearchClient({ spaces }: GlobalSearchClientProps) {
  const navigate = useViewTransitionNavigate();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";
  const spaceFilter = searchParams.get("space") || "";

  const [assets, setAssets] = useState<Asset[]>([]);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const spaceById = useMemo(
    () => new Map(spaces.map((b) => [b.id, b])),
    [spaces],
  );

  const load = useCallback(async () => {
    if (!q.trim()) {
      setAssets([]);
      setEntities([]);
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
      setEntities((json.entities ?? []) as Entity[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setAssets([]);
      setEntities([]);
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

  function openAsset(asset: Asset) {
    const space = asset.space_id ? spaceById.get(asset.space_id) : null;
    if (!space) return;
    const params = new URLSearchParams();
    if (asset.folder_id) params.set("folder", asset.folder_id);
    params.set("asset", asset.id);
    navigate(`/s/${space.slug}?${params.toString()}`);
  }

  function setSpaceFilter(id: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (id) params.set("space", id);
    else params.delete("space");
    navigate(`/search?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-5 w-full max-w-4xl mx-auto pb-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="type-page">Search results</h1>
          <p className="type-caption mt-1">
            {q.trim()
              ? loading
                ? `Searching for “${q.trim()}”…`
                : `${entities.length} entit${entities.length === 1 ? "y" : "ies"} · ${filteredAssets.length} document${filteredAssets.length === 1 ? "" : "s"}`
              : "Type above to search everything."}
          </p>
        </div>
        <GlassDropdown
          trigger={
            <span className="dock-btn">
              <IconFilter size={15} stroke={1.75} />
              Filters
              {spaceFilter ? (
                <span className="text-[var(--accent)]">· 1</span>
              ) : null}
            </span>
          }
          widthClass="w-[220px]"
        >
          <p className="card-label px-2.5 pt-1 pb-1">Filter</p>
          <button
            type="button"
            className="card-row"
            onClick={() => setSpaceFilter("")}
          >
            All files
          </button>
          {spaces.map((s) => (
            <button
              key={s.id}
              type="button"
              className="card-row"
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
        </GlassDropdown>
      </div>

      {error ? <p className="type-caption text-[#ff3b30]">{error}</p> : null}

      {loading ? <GlassSkeleton rows={4} className="mt-2" /> : null}

      {!loading &&
      q.trim() &&
      filteredAssets.length === 0 &&
      entities.length === 0 ? (
        <div className="glass-content p-8 text-center">
          <p className="type-body text-[var(--ink-soft)]">
            Nothing matched “{q.trim()}”. Try an entity name, invoice number, or
            file title.
          </p>
        </div>
      ) : null}

      {!loading ? (
        <div className="search-results-stagger flex flex-col gap-5">
          {entities.length > 0 ? (
            <section className="glass-content p-4 flex flex-col gap-2">
              <h2 className="card-label px-1">Entities</h2>
              <div className="flex flex-col gap-0.5">
                {entities.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    className="card-row"
                    onClick={() => navigate(`/e/${e.id}`)}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: entityTypeColor(e.entity_type?.name),
                      }}
                    />
                    <span className="flex-1 truncate text-left">{e.name}</span>
                    <span className="type-caption">
                      {e.entity_type?.label || "Entity"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {filteredAssets.length > 0 ? (
            <section className="glass-content p-4 flex flex-col gap-3">
              <h2 className="card-label px-1">Documents</h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
                {filteredAssets.map((asset) => {
                  const space = asset.space_id
                    ? spaceById.get(asset.space_id)
                    : null;
                  return (
                    <AssetCard
                      key={asset.id}
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
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
