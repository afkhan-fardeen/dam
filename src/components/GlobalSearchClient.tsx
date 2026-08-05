"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AssetCard } from "@/components/AssetCard";
import { EntityChip, entityTypeColor } from "@/components/EntityChip";
import type { Asset, Entity, Space } from "@/lib/types";

type GlobalSearchClientProps = {
  spaces: Space[];
};

export function GlobalSearchClient({ spaces }: GlobalSearchClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";

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
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
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
  }, [q]);

  useEffect(() => {
    const handle = window.setTimeout(() => void load(), 80);
    return () => window.clearTimeout(handle);
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, Asset[]>();
    for (const asset of assets) {
      const key = asset.space_id || "unknown";
      const list = map.get(key) ?? [];
      list.push(asset);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [assets]);

  const entitiesByType = useMemo(() => {
    const map = new Map<string, Entity[]>();
    for (const e of entities) {
      const key = e.entity_type?.label || "Entities";
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [entities]);

  function openAsset(asset: Asset) {
    const space = asset.space_id ? spaceById.get(asset.space_id) : null;
    if (!space) return;
    const params = new URLSearchParams();
    if (asset.folder_id) params.set("folder", asset.folder_id);
    params.set("asset", asset.id);
    router.push(`/s/${space.slug}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-4 p-5 w-full">
      <div>
        <h1 className="type-page text-base-content">Search results</h1>
        <p className="type-caption opacity-60 mt-1">
          {q.trim()
            ? loading
              ? `Searching for “${q.trim()}”…`
              : `${entities.length} entit${entities.length === 1 ? "y" : "ies"} · ${assets.length} document${assets.length === 1 ? "" : "s"}`
            : "Type in the top bar to search everything."}
        </p>
      </div>

      {error ? <p className="type-caption text-error">{error}</p> : null}

      {!loading &&
      q.trim() &&
      assets.length === 0 &&
      entities.length === 0 ? (
        <p className="type-body opacity-60 py-8 max-w-xl">
          Nothing matched “{q.trim()}”. Try an entity name, invoice number, or
          file title — or clear the search and browse a space from the sidebar.
        </p>
      ) : null}

      {entitiesByType.map(([typeLabel, list]) => (
        <section key={typeLabel} className="flex flex-col gap-2">
          <h2 className="type-micro opacity-50">
            {typeLabel}
            <span className="font-normal ml-1">· {list.length}</span>
          </h2>
          <div className="flex flex-col gap-1">
            {list.map((e) => (
              <button
                key={e.id}
                type="button"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-base-200"
                onClick={() => router.push(`/e/${e.id}`)}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: entityTypeColor(e.entity_type?.name) }}
                />
                <span className="text-sm font-medium flex-1 truncate">
                  {e.name}
                </span>
                <EntityChip entity={e} />
              </button>
            ))}
          </div>
        </section>
      ))}

      {grouped.length > 0 ? (
        <h2 className="type-micro opacity-50">Documents</h2>
      ) : null}

      {grouped.map(([spaceId, list]) => {
        const space = spaceById.get(spaceId);
        return (
          <section key={spaceId}>
            <h2 className="type-micro opacity-50 mb-2 flex items-center gap-2">
              {space ? (
                <span
                  className="h-2 w-2"
                  style={{ backgroundColor: space.color }}
                />
              ) : null}
              {space?.name || "Unknown space"}
              <span>· {list.length}</span>
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
              {list.map((asset) => (
                <div key={asset.id} className="flex flex-col">
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
                  {asset.locked && space ? (
                    <p className="px-2 type-caption opacity-60">
                      In {space.name} · Locked
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
