import type { Asset } from "@/lib/types";

/** In-memory folder listing cache for instant same-space navigation. */

type CacheEntry = {
  assets: Asset[];
  at: number;
};

const MAX_ENTRIES = 40;
const store = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Asset[] | null>>();

export function folderListCacheKey(
  spaceId: string,
  opts: {
    folderId?: string | null;
    view?: string;
    query?: string;
  },
): string {
  const q = (opts.query || "").trim();
  if (q) return `${spaceId}:q:${q.toLowerCase()}`;
  const view = opts.view || "all";
  if (view !== "all") return `${spaceId}:v:${view}`;
  return `${spaceId}:f:${opts.folderId || "root"}`;
}

export function getCachedFolderAssets(key: string): Asset[] | null {
  const hit = store.get(key);
  return hit ? hit.assets : null;
}

export function setCachedFolderAssets(key: string, assets: Asset[]) {
  store.set(key, { assets, at: Date.now() });
  if (store.size <= MAX_ENTRIES) return;
  // Drop oldest
  let oldestKey: string | null = null;
  let oldestAt = Infinity;
  for (const [k, v] of store) {
    if (v.at < oldestAt) {
      oldestAt = v.at;
      oldestKey = k;
    }
  }
  if (oldestKey) store.delete(oldestKey);
}

export function invalidateFolderAssetsCache(spaceId?: string) {
  if (!spaceId) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(`${spaceId}:`)) store.delete(key);
  }
}

/** Warm cache for a folder listing (hover prefetch). */
export async function prefetchFolderAssets(
  spaceId: string,
  folderId: string | null,
): Promise<void> {
  const key = folderListCacheKey(spaceId, { folderId, view: "all" });
  if (store.has(key) || inflight.has(key)) return;

  const params = new URLSearchParams({ space_id: spaceId });
  if (folderId) params.set("folder_id", folderId);

  const promise = (async () => {
    try {
      const res = await fetch(`/api/search?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) return null;
      const assets = (json.assets as Asset[]) ?? [];
      setCachedFolderAssets(key, assets);
      return assets;
    } catch {
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  await promise;
}
