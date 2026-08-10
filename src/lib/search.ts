import type { SupabaseClient } from "@supabase/supabase-js";
import type { Asset, Folder, Tag } from "@/lib/types";
import { getBlockedFolderIds } from "@/lib/folderAccess";

export type FolderSearchHit = Folder & {
  space_name?: string | null;
  space_slug?: string | null;
  space_color?: string | null;
};

function emptyToNull(value: string | null | undefined): string | null {
  if (!value || value.trim() === "") return null;
  return value;
}

const ASSET_COLS =
  "id,file_id,original_name,mime_type,size,space_id,folder_id,description,brand,created_by,uploaded_by,has_thumbnail,status,created_at,tags_text,extracted_text";

export async function attachTags(
  supabase: SupabaseClient,
  assets: Asset[],
): Promise<Asset[]> {
  if (assets.length === 0) return assets;
  const ids = assets.map((a) => a.id);

  // Two-step load avoids fragile nested embeds (tags often looked "unsaved").
  const { data: links, error: linkError } = await supabase
    .from("asset_tags")
    .select("asset_id,tag_id")
    .in("asset_id", ids);
  if (linkError) throw linkError;
  if (!links?.length) {
    return assets.map((a) => ({ ...a, tags: a.tags ?? [] }));
  }

  const tagIds = [...new Set(links.map((r) => r.tag_id as string))];
  const { data: tagRows, error: tagError } = await supabase
    .from("tags")
    .select("id,name,created_at")
    .in("id", tagIds);
  if (tagError) throw tagError;

  const tagById = new Map(
    (tagRows ?? []).map((t) => [
      t.id as string,
      {
        id: t.id as string,
        name: t.name as string,
        created_at: (t.created_at as string) ?? null,
      } satisfies Tag,
    ]),
  );

  const byAsset = new Map<string, Tag[]>();
  for (const row of links) {
    const tag = tagById.get(row.tag_id as string);
    if (!tag) continue;
    const list = byAsset.get(row.asset_id as string) ?? [];
    list.push(tag);
    byAsset.set(row.asset_id as string, list);
  }

  return assets.map((a) => ({
    ...a,
    tags: byAsset.get(a.id) ?? [],
  }));
}

export async function attachFavorites(
  supabase: SupabaseClient,
  userId: string,
  assets: Asset[],
): Promise<Asset[]> {
  if (assets.length === 0) return assets;
  const ids = assets.map((a) => a.id);
  const { data } = await supabase
    .from("asset_favorites")
    .select("asset_id")
    .eq("user_id", userId)
    .in("asset_id", ids);

  const starred = new Set((data ?? []).map((r) => r.asset_id as string));
  return assets.map((a) => ({
    ...a,
    favorited: starred.has(a.id),
  }));
}

/** Ensure tag rows exist and link them to the asset. Replaces existing links when replace=true. */
export async function setAssetTags(
  supabase: SupabaseClient,
  assetId: string,
  tagNames: string[],
  replace = true,
): Promise<void> {
  // Dedupe case-insensitively, keep first spelling
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const raw of tagNames) {
    const name = raw.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(name);
  }

  if (replace) {
    const { error: delError } = await supabase
      .from("asset_tags")
      .delete()
      .eq("asset_id", assetId);
    if (delError) throw delError;
  }

  if (cleaned.length === 0) return;

  const tagIds: string[] = [];
  for (const name of cleaned) {
    // Exact case-insensitive match (escape LIKE wildcards).
    const pattern = name.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
    const { data: existingRows, error: findError } = await supabase
      .from("tags")
      .select("id,name")
      .ilike("name", pattern)
      .limit(5);
    if (findError) throw findError;
    const existing = (existingRows ?? []).find(
      (row) => String(row.name).toLowerCase() === name.toLowerCase(),
    );
    if (existing?.id) {
      tagIds.push(existing.id);
      continue;
    }
    const { data: created, error } = await supabase
      .from("tags")
      .insert({ name })
      .select("id")
      .single();
    if (error) {
      // Race: another request created the same name — fetch it
      const { data: raced } = await supabase
        .from("tags")
        .select("id,name")
        .ilike("name", pattern)
        .limit(5);
      const hit = (raced ?? []).find(
        (row) => String(row.name).toLowerCase() === name.toLowerCase(),
      );
      if (hit?.id) {
        tagIds.push(hit.id);
        continue;
      }
      throw error;
    }
    if (!created) throw new Error("Could not create tag");
    tagIds.push(created.id);
  }

  const { error: linkError } = await supabase.from("asset_tags").upsert(
    tagIds.map((tag_id) => ({ asset_id: assetId, tag_id })),
    { onConflict: "asset_id,tag_id" },
  );
  if (linkError) throw linkError;
}

/** Resolve asset ids that have a tag (case-insensitive exact name). */
async function assetIdsForTag(
  supabase: SupabaseClient,
  tagName: string,
): Promise<string[]> {
  const { data: tagRows, error: tagError } = await supabase
    .from("tags")
    .select("id")
    .ilike("name", tagName);
  if (tagError) throw tagError;
  if (!tagRows?.length) return [];

  const { data: links, error: linkError } = await supabase
    .from("asset_tags")
    .select("asset_id")
    .in(
      "tag_id",
      tagRows.map((t) => t.id),
    );
  if (linkError) throw linkError;
  return [...new Set((links ?? []).map((r) => r.asset_id as string))];
}

export async function countFolderAssets(
  supabase: SupabaseClient,
  options: {
    spaceId: string;
    folderId: string | null;
    tag?: string | null;
  },
): Promise<number> {
  let query = supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .eq("space_id", options.spaceId);

  if (options.folderId) {
    query = query.eq("folder_id", options.folderId);
  } else {
    query = query.is("folder_id", null);
  }

  const tag = emptyToNull(options.tag);
  if (tag) {
    const ids = await assetIdsForTag(supabase, tag);
    if (ids.length === 0) return 0;
    query = query.in("id", ids);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function listFolderAssets(
  supabase: SupabaseClient,
  options: {
    spaceId: string;
    folderId: string | null;
    tag?: string | null;
    limit?: number;
    offset?: number;
  },
): Promise<Asset[]> {
  const limit = options.limit ?? 48;
  const offset = options.offset ?? 0;

  let query = supabase
    .from("assets")
    .select(ASSET_COLS)
    .eq("status", "active")
    .eq("space_id", options.spaceId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (options.folderId) {
    query = query.eq("folder_id", options.folderId);
  } else {
    query = query.is("folder_id", null);
  }

  const tag = emptyToNull(options.tag);
  if (tag) {
    const ids = await assetIdsForTag(supabase, tag);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }

  const { data, error } = await query;
  if (error) throw error;
  return attachTags(supabase, (data ?? []) as Asset[]);
}

export async function listRecentAssets(
  supabase: SupabaseClient,
  options: {
    spaceId?: string;
    spaceIds?: string[];
    tag?: string | null;
    limit?: number;
  },
): Promise<Asset[]> {
  let query = supabase
    .from("assets")
    .select(ASSET_COLS)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 48);

  if (options.spaceId) {
    query = query.eq("space_id", options.spaceId);
  } else if (options.spaceIds?.length) {
    query = query.in("space_id", options.spaceIds);
  }

  const tag = emptyToNull(options.tag);
  if (tag) {
    const ids = await assetIdsForTag(supabase, tag);
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }

  const { data, error } = await query;
  if (error) throw error;
  return attachTags(supabase, (data ?? []) as Asset[]);
}

export async function countTrashAssets(
  supabase: SupabaseClient,
  options: { spaceIds: string[] },
): Promise<number> {
  if (options.spaceIds.length === 0) return 0;
  const { count, error } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("status", "deleted")
    .in("space_id", options.spaceIds);
  if (error) throw error;
  return count ?? 0;
}

export async function listTrashAssets(
  supabase: SupabaseClient,
  options: {
    spaceId?: string;
    spaceIds?: string[];
    limit?: number;
    offset?: number;
  },
): Promise<Asset[]> {
  const limit = options.limit ?? 48;
  const offset = options.offset ?? 0;
  const spaceIds = options.spaceIds?.length
    ? options.spaceIds
    : options.spaceId
      ? [options.spaceId]
      : [];
  if (spaceIds.length === 0) return [];

  const { data, error } = await supabase
    .from("assets")
    .select(ASSET_COLS)
    .eq("status", "deleted")
    .in("space_id", spaceIds)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return attachTags(supabase, (data ?? []) as Asset[]);
}

/** Lightweight refs for empty-trash / bulk permanent delete. */
export async function listTrashAssetRefs(
  supabase: SupabaseClient,
  options: { spaceIds: string[] },
): Promise<{ id: string; original_name: string | null }[]> {
  if (options.spaceIds.length === 0) return [];
  const { data, error } = await supabase
    .from("assets")
    .select("id,original_name")
    .eq("status", "deleted")
    .in("space_id", options.spaceIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as { id: string; original_name: string | null }[];
}

async function searchOneSpace(
  supabase: SupabaseClient,
  q: string,
  spaceId: string,
  tag: string | null,
): Promise<Asset[]> {
  const { data: ftsData, error: ftsError } = await supabase.rpc(
    "search_assets_fts",
    {
      q,
      p_space_id: spaceId,
      tag_filter: tag,
    },
  );
  if (ftsError) throw ftsError;

  const ftsResults = (ftsData ?? []) as Asset[];
  if (ftsResults.length > 0) return attachTags(supabase, ftsResults);

  const { data: trgmData, error: trgmError } = await supabase.rpc(
    "search_assets_trgm",
    {
      q,
      p_space_id: spaceId,
      tag_filter: tag,
    },
  );
  if (trgmError) throw trgmError;
  return attachTags(supabase, (trgmData ?? []) as Asset[]);
}

export async function filterUnlockedAssets(
  supabase: SupabaseClient,
  userId: string,
  assets: Asset[],
): Promise<Asset[]> {
  if (assets.length === 0) return assets;

  const spaceIds = [
    ...new Set(assets.map((a) => a.space_id).filter(Boolean) as string[]),
  ];
  if (spaceIds.length === 0) return assets;

  const { data: folders } = await supabase
    .from("folders")
    .select("id,parent_folder_id,passcode_enabled,space_id")
    .in("space_id", spaceIds);

  const rows = (folders ?? []).map((f) => ({
    id: f.id as string,
    parent_folder_id: (f.parent_folder_id as string | null) ?? null,
    passcode_enabled: Boolean(f.passcode_enabled),
  }));

  const blocked = await getBlockedFolderIds(supabase, userId, rows);

  return assets.filter((a) => {
    if (!a.folder_id) return true;
    return !blocked.has(a.folder_id);
  });
}

/** Keep locked assets visible for search, flagged for UI. */
export async function markLockedAssets(
  supabase: SupabaseClient,
  userId: string,
  assets: Asset[],
): Promise<Asset[]> {
  if (assets.length === 0) return assets;

  const spaceIds = [
    ...new Set(assets.map((a) => a.space_id).filter(Boolean) as string[]),
  ];
  if (spaceIds.length === 0) return assets;

  const { data: folders } = await supabase
    .from("folders")
    .select("id,parent_folder_id,passcode_enabled,space_id")
    .in("space_id", spaceIds);

  const rows = (folders ?? []).map((f) => ({
    id: f.id as string,
    parent_folder_id: (f.parent_folder_id as string | null) ?? null,
    passcode_enabled: Boolean(f.passcode_enabled),
  }));

  const blocked = await getBlockedFolderIds(supabase, userId, rows);

  return assets.map((a) => ({
    ...a,
    locked: Boolean(a.folder_id && blocked.has(a.folder_id)),
  }));
}

export async function searchAssets(
  supabase: SupabaseClient,
  options: {
    q: string;
    spaceId?: string | null;
    spaceIds?: string[];
    tag?: string | null;
    entityId?: string | null;
    userId?: string;
  },
): Promise<Asset[]> {
  const q = options.q.trim();
  const tag = emptyToNull(options.tag);

  const spaceIds =
    options.spaceIds?.length
      ? options.spaceIds
      : options.spaceId
        ? [options.spaceId]
        : [];

  if (spaceIds.length === 0) return [];

  if (!q && !options.entityId) {
    const assets = await listRecentAssets(supabase, {
      spaceIds,
      tag,
      limit: 48,
    });
    if (options.userId) {
      return filterUnlockedAssets(supabase, options.userId, assets);
    }
    return assets;
  }

  const seen = new Set<string>();
  const merged: Asset[] = [];

  function pushAll(list: Asset[]) {
    for (const asset of list) {
      if (seen.has(asset.id)) continue;
      if (!spaceIds.includes(asset.space_id as string)) continue;
      seen.add(asset.id);
      merged.push(asset);
    }
  }

  if (q) {
    const chunks = await Promise.all(
      spaceIds.map((id) => searchOneSpace(supabase, q, id, tag)),
    );
    for (const chunk of chunks) pushAll(chunk);

    // Entity name / alias matches → linked assets (RLS filters visibility)
    const { data: byEntity } = await supabase.rpc("search_asset_ids_by_entity", {
      q,
    });
    const entityAssetIds = (byEntity ?? []).map(
      (r: { asset_id: string }) => r.asset_id,
    );

    // Attribute value matches
    const { data: byAttr } = await supabase.rpc("search_asset_ids_by_attribute", {
      q,
    });
    const attrAssetIds = (byAttr ?? []).map(
      (r: { asset_id: string }) => r.asset_id,
    );

    const extraIds = [
      ...new Set([...entityAssetIds, ...attrAssetIds]),
    ].filter((id) => !seen.has(id));

    if (extraIds.length > 0) {
      let query = supabase
        .from("assets")
        .select(ASSET_COLS)
        .eq("status", "active")
        .in("id", extraIds)
        .in("space_id", spaceIds);
      if (tag) {
        const tagIds = await assetIdsForTag(supabase, tag);
        if (tagIds.length === 0) {
          /* skip */
        } else {
          query = query.in("id", extraIds.filter((id) => tagIds.includes(id)));
        }
      }
      const { data: extra } = await query;
      if (extra) pushAll(await attachTags(supabase, extra as Asset[]));
    }
  }

  if (options.entityId) {
    const { data: links } = await supabase
      .from("asset_entities")
      .select("asset_id")
      .eq("entity_id", options.entityId);
    const ids = (links ?? []).map((l) => l.asset_id as string);
    if (ids.length > 0) {
      const { data } = await supabase
        .from("assets")
        .select(ASSET_COLS)
        .eq("status", "active")
        .in("id", ids)
        .in("space_id", spaceIds);
      if (data) pushAll(await attachTags(supabase, data as Asset[]));
    }
  }

  if (options.userId) {
    return markLockedAssets(supabase, options.userId, merged);
  }
  return merged;
}

export async function searchEntityHits(
  supabase: SupabaseClient,
  q: string,
  limit = 20,
) {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const { data, error } = await supabase.rpc("search_entities_trgm", {
    q: trimmed,
    limit_n: limit,
  });
  if (error) throw error;

  const rows = (data ?? []) as {
    id: string;
    type_id: string;
    name: string;
    aliases: string[];
    description: string | null;
    status: string;
  }[];

  if (rows.length === 0) return [];

  const { data: types } = await supabase
    .from("entity_types")
    .select("id,name,label,is_system,created_at");
  const typeMap = new Map((types ?? []).map((t) => [t.id, t]));

  return rows.map((e) => ({
    ...e,
    aliases: e.aliases ?? [],
    entity_type: typeMap.get(e.type_id) ?? null,
  }));
}

/** Folder name matches within accessible spaces (permission via RLS + spaceIds). */
export async function searchFolderHits(
  supabase: SupabaseClient,
  options: { q: string; spaceIds: string[]; limit?: number },
): Promise<FolderSearchHit[]> {
  const trimmed = options.q.trim();
  if (!trimmed || options.spaceIds.length === 0) return [];

  const { data, error } = await supabase
    .from("folders")
    .select(
      "id,space_id,parent_folder_id,name,passcode_enabled,created_by,created_at",
    )
    .in("space_id", options.spaceIds)
    .ilike("name", `%${trimmed}%`)
    .order("name")
    .limit(options.limit ?? 24);

  if (error) throw error;
  const rows = (data ?? []) as Folder[];
  if (rows.length === 0) return [];

  const spaceIds = [...new Set(rows.map((r) => r.space_id))];
  const { data: spaces } = await supabase
    .from("spaces")
    .select("id,name,slug,color")
    .in("id", spaceIds);
  const spaceMap = new Map(
    (spaces ?? []).map((s) => [
      s.id as string,
      {
        name: s.name as string,
        slug: s.slug as string,
        color: s.color as string,
      },
    ]),
  );

  return rows.map((row) => {
    const sp = spaceMap.get(row.space_id);
    return {
      ...row,
      space_name: sp?.name ?? null,
      space_slug: sp?.slug ?? null,
      space_color: sp?.color ?? null,
    };
  });
}
