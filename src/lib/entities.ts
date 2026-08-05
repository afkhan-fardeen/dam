import type { SupabaseClient } from "@supabase/supabase-js";
import type { Asset, Entity, EntityType } from "@/lib/types";

const ENTITY_COLS =
  "id,type_id,name,aliases,description,status,merged_into_id,roles,created_by,created_at,updated_at";

export async function listEntityTypes(
  supabase: SupabaseClient,
): Promise<EntityType[]> {
  const { data, error } = await supabase
    .from("entity_types")
    .select("id,name,label,is_system,created_at")
    .order("label");
  if (error) throw error;
  return (data ?? []) as EntityType[];
}

export async function searchEntities(
  supabase: SupabaseClient,
  options: { q?: string; typeId?: string | null; status?: string; limit?: number },
): Promise<Entity[]> {
  const q = options.q?.trim() ?? "";
  const status = options.status ?? "active";

  if (q) {
    const { data, error } = await supabase.rpc("suggest_similar_entities", {
      q,
      p_type_id: options.typeId || null,
    });
    if (error) throw error;
    let rows = (data ?? []) as Entity[];
    if (status !== "all") {
      rows = rows.filter((e) => e.status === status);
    }
    return rows.slice(0, options.limit ?? 20);
  }

  let query = supabase
    .from("entities")
    .select(ENTITY_COLS)
    .order("name")
    .limit(options.limit ?? 40);

  if (status !== "all") query = query.eq("status", status);
  if (options.typeId) query = query.eq("type_id", options.typeId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Entity[];
}

export async function getEntity(
  supabase: SupabaseClient,
  id: string,
): Promise<Entity | null> {
  const { data, error } = await supabase
    .from("entities")
    .select(
      `${ENTITY_COLS}, entity_types ( id, name, label, is_system, created_at )`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as Entity & {
    entity_types?: EntityType | EntityType[] | null;
  };
  const et = Array.isArray(row.entity_types)
    ? row.entity_types[0]
    : row.entity_types;
  return {
    ...row,
    entity_type: et ?? null,
    aliases: row.aliases ?? [],
    roles: row.roles ?? [],
  };
}

export async function createEntity(
  supabase: SupabaseClient,
  input: {
    type_id: string;
    name: string;
    aliases?: string[];
    description?: string | null;
    roles?: string[];
    created_by: string;
  },
): Promise<{ entity: Entity; suggested_duplicates: Entity[] }> {
  const name = input.name.trim();
  const suggested = await searchEntities(supabase, {
    q: name,
    typeId: input.type_id,
    limit: 5,
  });
  const suggested_duplicates = suggested.filter(
    (e) => e.name.toLowerCase() !== name.toLowerCase() || e.status === "active",
  );

  const { data, error } = await supabase
    .from("entities")
    .insert({
      type_id: input.type_id,
      name,
      aliases: input.aliases ?? [],
      description: input.description ?? null,
      roles: input.roles ?? [],
      created_by: input.created_by,
      status: "active",
    })
    .select(ENTITY_COLS)
    .single();

  if (error) throw error;
  return {
    entity: data as Entity,
    suggested_duplicates: suggested_duplicates.slice(0, 5),
  };
}

export async function mergeEntities(
  supabase: SupabaseClient,
  sourceId: string,
  targetId: string,
): Promise<void> {
  if (sourceId === targetId) {
    throw new Error("Cannot merge an entity into itself");
  }

  const { data: sourceLinks } = await supabase
    .from("asset_entities")
    .select("asset_id,relation_label,created_by")
    .eq("entity_id", sourceId);

  for (const link of sourceLinks ?? []) {
    const { data: existing } = await supabase
      .from("asset_entities")
      .select("asset_id")
      .eq("asset_id", link.asset_id)
      .eq("entity_id", targetId)
      .maybeSingle();

    if (!existing) {
      await supabase.from("asset_entities").insert({
        asset_id: link.asset_id,
        entity_id: targetId,
        relation_label: link.relation_label,
        created_by: link.created_by,
      });
    }
  }

  await supabase.from("asset_entities").delete().eq("entity_id", sourceId);

  const { error } = await supabase
    .from("entities")
    .update({
      status: "merged",
      merged_into_id: targetId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceId);

  if (error) throw error;
}

export async function getRelatedDocuments(
  supabase: SupabaseClient,
  entityId: string,
  limit = 48,
): Promise<Asset[]> {
  const { data: links, error } = await supabase
    .from("asset_entities")
    .select("asset_id")
    .eq("entity_id", entityId)
    .limit(limit);

  if (error) throw error;
  const ids = (links ?? []).map((l) => l.asset_id as string);
  if (ids.length === 0) return [];

  const { data: assets, error: aErr } = await supabase
    .from("assets")
    .select(
      "id,file_id,original_name,mime_type,size,space_id,folder_id,description,created_by,uploaded_by,has_thumbnail,status,created_at,tags_text",
    )
    .in("id", ids)
    .eq("status", "active");

  if (aErr) throw aErr;
  // RLS already filters by can_view_space
  return (assets ?? []) as Asset[];
}

export async function listAssetEntities(
  supabase: SupabaseClient,
  assetId: string,
): Promise<(Entity & { relation_label: string | null })[]> {
  const { data, error } = await supabase
    .from("asset_entities")
    .select(
      `relation_label, entities ( ${ENTITY_COLS}, entity_types ( id, name, label, is_system, created_at ) )`,
    )
    .eq("asset_id", assetId);

  if (error) throw error;

  return (data ?? [])
    .map((row) => {
      const raw = row.entities as unknown;
      const ent = (Array.isArray(raw) ? raw[0] : raw) as
        | (Entity & { entity_types?: EntityType | EntityType[] | null })
        | null;
      if (!ent || ent.status === "merged") return null;
      const et = Array.isArray(ent.entity_types)
        ? ent.entity_types[0]
        : ent.entity_types;
      return {
        ...ent,
        entity_type: et ?? null,
        aliases: ent.aliases ?? [],
        roles: ent.roles ?? [],
        relation_label: (row.relation_label as string | null) ?? null,
      };
    })
    .filter(Boolean) as (Entity & { relation_label: string | null })[];
}

export async function userCanEditAnySpace(
  supabase: SupabaseClient,
  userId: string,
  isAdmin: boolean,
): Promise<boolean> {
  if (isAdmin) return true;
  const { data } = await supabase
    .from("space_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "editor")
    .limit(1);
  return (data?.length ?? 0) > 0;
}
