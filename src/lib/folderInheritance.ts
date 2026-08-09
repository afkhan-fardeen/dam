import type { SupabaseClient } from "@supabase/supabase-js";
import { setAssetTags } from "@/lib/search";

type FolderRow = {
  id: string;
  space_id: string;
  parent_folder_id: string | null;
  brand: string | null;
};

export type EffectiveFolderMeta = {
  brand: string | null;
  tagNames: string[];
};

/** Walk ancestors (nearest first) for brand; union folder tags along the chain. */
export async function resolveEffectiveFolderMeta(
  supabase: SupabaseClient,
  spaceId: string,
  folderId: string | null,
  spaceKind?: string | null,
  spaceName?: string | null,
): Promise<EffectiveFolderMeta> {
  const { data: folders } = await supabase
    .from("folders")
    .select("id,space_id,parent_folder_id,brand")
    .eq("space_id", spaceId);

  const byId = new Map(
    ((folders ?? []) as FolderRow[]).map((f) => [f.id, f]),
  );

  const chain: string[] = [];
  let cur = folderId ? byId.get(folderId) : undefined;
  while (cur) {
    chain.push(cur.id);
    cur = cur.parent_folder_id ? byId.get(cur.parent_folder_id) : undefined;
  }

  let brand: string | null = null;
  for (const id of chain) {
    const b = byId.get(id)?.brand?.trim();
    if (b) {
      brand = b;
      break;
    }
  }
  if (!brand && spaceKind === "brand" && spaceName?.trim()) {
    brand = spaceName.trim();
  }

  const tagNames: string[] = [];
  if (chain.length > 0) {
    const { data: links } = await supabase
      .from("folder_tags")
      .select("folder_id,tag_id")
      .in("folder_id", chain);
    const tagIds = [...new Set((links ?? []).map((l) => l.tag_id as string))];
    if (tagIds.length > 0) {
      const { data: tags } = await supabase
        .from("tags")
        .select("id,name")
        .in("id", tagIds);
      const nameById = new Map(
        (tags ?? []).map((t) => [t.id as string, t.name as string]),
      );
      const seen = new Set<string>();
      // Ancestor-first (root → leaf): walk chain reversed so closer tags still included
      for (const fid of [...chain].reverse()) {
        for (const link of links ?? []) {
          if (link.folder_id !== fid) continue;
          const name = nameById.get(link.tag_id as string);
          if (!name) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          tagNames.push(name);
        }
      }
    }
  }

  return { brand, tagNames };
}

/** Recompute brand (+ merge inherited tags) for all active assets under a folder subtree. */
export async function recomputeSubtreeInheritance(
  supabase: SupabaseClient,
  spaceId: string,
  rootFolderId: string,
  spaceKind?: string | null,
  spaceName?: string | null,
): Promise<number> {
  const { data: folders } = await supabase
    .from("folders")
    .select("id,parent_folder_id")
    .eq("space_id", spaceId);

  const children = new Map<string | null, string[]>();
  for (const f of folders ?? []) {
    const parent = (f.parent_folder_id as string | null) ?? null;
    const list = children.get(parent) ?? [];
    list.push(f.id as string);
    children.set(parent, list);
  }

  const subtree: string[] = [];
  const stack = [rootFolderId];
  while (stack.length) {
    const id = stack.pop()!;
    subtree.push(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }

  const { data: assets } = await supabase
    .from("assets")
    .select("id,folder_id")
    .eq("space_id", spaceId)
    .eq("status", "active")
    .in("folder_id", subtree);

  let updated = 0;
  for (const asset of assets ?? []) {
    const folderId = (asset.folder_id as string | null) ?? null;
    const effective = await resolveEffectiveFolderMeta(
      supabase,
      spaceId,
      folderId,
      spaceKind,
      spaceName,
    );

    await supabase
      .from("assets")
      .update({ brand: effective.brand })
      .eq("id", asset.id);

    if (effective.tagNames.length > 0) {
      const { data: links } = await supabase
        .from("asset_tags")
        .select("tag_id")
        .eq("asset_id", asset.id);
      const tagIds = (links ?? []).map((l) => l.tag_id as string);
      let ownNames: string[] = [];
      if (tagIds.length > 0) {
        const { data: tagRows } = await supabase
          .from("tags")
          .select("id,name")
          .in("id", tagIds);
        ownNames = (tagRows ?? []).map((t) => t.name as string);
      }
      const merged = [...ownNames];
      const seen = new Set(ownNames.map((n) => n.toLowerCase()));
      for (const name of effective.tagNames) {
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(name);
      }
      await setAssetTags(supabase, asset.id as string, merged, true);
    }
    updated += 1;
  }

  return updated;
}

export async function setFolderTags(
  supabase: SupabaseClient,
  folderId: string,
  tagNames: string[],
): Promise<void> {
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

  await supabase.from("folder_tags").delete().eq("folder_id", folderId);
  if (cleaned.length === 0) return;

  for (const name of cleaned) {
    const { data: existing } = await supabase
      .from("tags")
      .select("id")
      .ilike("name", name)
      .maybeSingle();
    let tagId = existing?.id as string | undefined;
    if (!tagId) {
      const { data: created, error } = await supabase
        .from("tags")
        .insert({ name })
        .select("id")
        .single();
      if (error) throw error;
      tagId = created.id as string;
    }
    const { error: linkErr } = await supabase
      .from("folder_tags")
      .insert({ folder_id: folderId, tag_id: tagId });
    if (linkErr && !linkErr.message.includes("duplicate")) throw linkErr;
  }
}
