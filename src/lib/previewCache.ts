/** In-memory caches so preview next/prev doesn't refetch every time. */

type EntityRow = {
  id: string;
  name?: string | null;
  kind?: string | null;
  relation_label?: string | null;
  [key: string]: unknown;
};

const ENTITY_CACHE = new Map<string, EntityRow[]>();
const ENTITY_MAX = 48;

export function getCachedEntities(assetId: string): EntityRow[] | undefined {
  return ENTITY_CACHE.get(assetId);
}

export function setCachedEntities(assetId: string, rows: EntityRow[]): void {
  ENTITY_CACHE.set(assetId, rows);
  if (ENTITY_CACHE.size <= ENTITY_MAX) return;
  const first = ENTITY_CACHE.keys().next().value;
  if (first) ENTITY_CACHE.delete(first);
}

/** Warm browser cache for thumbnails / light previews */
export function prefetchMediaUrls(urls: (string | null | undefined)[]): void {
  if (typeof window === "undefined") return;
  for (const url of urls) {
    if (!url) continue;
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }
}
