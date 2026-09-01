import type { SupabaseClient } from "@supabase/supabase-js";
import type { FsNode, PermissionLevel, Tag } from "@/lib/types";

export const FS_NODE_COLS =
  "id,parent_id,node_type,name,relative_path,size_bytes,mime_type,content_hash,description,created_by,uploaded_by,has_thumbnail,passcode_enabled,tags_text,last_synced_at,is_deleted,deleted_at,created_at,updated_at";

export function joinRelative(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .map((p) => String(p).replace(/^\/+|\/+$/g, "").replace(/\\/g, "/"))
    .filter(Boolean)
    .join("/");
}

export function parentRelativePath(relativePath: string): string | null {
  const norm = relativePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const i = norm.lastIndexOf("/");
  if (i <= 0) return null;
  return norm.slice(0, i);
}

export function basenamePath(relativePath: string): string {
  const norm = relativePath.replace(/\\/g, "/").replace(/\/+$/g, "");
  const i = norm.lastIndexOf("/");
  return i >= 0 ? norm.slice(i + 1) : norm;
}

export function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export async function attachFsNodeTags(
  supabase: SupabaseClient,
  nodes: FsNode[],
): Promise<FsNode[]> {
  if (nodes.length === 0) return nodes;
  const ids = nodes.map((n) => n.id);
  const { data: links, error: linkError } = await supabase
    .from("fs_node_tags")
    .select("fs_node_id,tag_id")
    .in("fs_node_id", ids);
  if (linkError) throw linkError;
  if (!links?.length) {
    return nodes.map((n) => ({ ...n, tags: n.tags ?? [] }));
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
  const byNode = new Map<string, Tag[]>();
  for (const row of links) {
    const tag = tagById.get(row.tag_id as string);
    if (!tag) continue;
    const list = byNode.get(row.fs_node_id as string) ?? [];
    list.push(tag);
    byNode.set(row.fs_node_id as string, list);
  }
  return nodes.map((n) => ({ ...n, tags: byNode.get(n.id) ?? [] }));
}

export async function attachFsFavorites(
  supabase: SupabaseClient,
  userId: string,
  nodes: FsNode[],
): Promise<FsNode[]> {
  if (nodes.length === 0) return nodes;
  const ids = nodes.map((n) => n.id);
  const { data } = await supabase
    .from("fs_node_favorites")
    .select("fs_node_id")
    .eq("user_id", userId)
    .in("fs_node_id", ids);
  const starred = new Set((data ?? []).map((r) => r.fs_node_id as string));
  return nodes.map((n) => ({ ...n, favorited: starred.has(n.id) }));
}

export async function setFsNodeTags(
  supabase: SupabaseClient,
  nodeId: string,
  tagNames: string[],
  replace = true,
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

  if (replace) {
    const { error: delError } = await supabase
      .from("fs_node_tags")
      .delete()
      .eq("fs_node_id", nodeId);
    if (delError) throw delError;
  }
  if (cleaned.length === 0) return;

  const tagIds: string[] = [];
  for (const name of cleaned) {
    const pattern = name
      .replace(/\\/g, "\\\\")
      .replace(/%/g, "\\%")
      .replace(/_/g, "\\_");
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

  const { error: linkError } = await supabase.from("fs_node_tags").upsert(
    tagIds.map((tag_id) => ({ fs_node_id: nodeId, tag_id })),
    { onConflict: "fs_node_id,tag_id" },
  );
  if (linkError) throw linkError;
}

export async function listFsChildren(
  supabase: SupabaseClient,
  options: {
    parentId: string | null;
    includeDeleted?: boolean;
  },
): Promise<FsNode[]> {
  let query = supabase
    .from("fs_nodes")
    .select(FS_NODE_COLS)
    .order("node_type", { ascending: true })
    .order("name", { ascending: true });

  if (!options.includeDeleted) {
    query = query.eq("is_deleted", false);
  }
  if (options.parentId) {
    query = query.eq("parent_id", options.parentId);
  } else {
    query = query.is("parent_id", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as FsNode[];
}

export async function getFsNodeByPath(
  supabase: SupabaseClient,
  relativePath: string,
): Promise<FsNode | null> {
  const path = normalizeRelativePath(relativePath);
  const { data, error } = await supabase
    .from("fs_nodes")
    .select(FS_NODE_COLS)
    .eq("relative_path", path)
    .maybeSingle();
  if (error) throw error;
  return (data as FsNode | null) ?? null;
}

/** Resolve parent folder; null parent = drive root (empty path). */
export async function resolveParentFolder(
  supabase: SupabaseClient,
  parentId: string | null | undefined,
): Promise<{ parentId: string | null; parentPath: string }> {
  if (!parentId) {
    return { parentId: null, parentPath: "" };
  }
  const { data: parent, error } = await supabase
    .from("fs_nodes")
    .select(FS_NODE_COLS)
    .eq("id", parentId)
    .maybeSingle();
  if (error) throw error;
  if (!parent || parent.node_type !== "folder" || parent.is_deleted) {
    throw new Error("Parent folder not found");
  }
  return { parentId: parent.id, parentPath: parent.relative_path };
}

/** Grant creator edit on a newly created folder. */
export async function grantCreatorEdit(
  supabase: SupabaseClient,
  folderId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from("folder_permissions").upsert(
    {
      fs_node_id: folderId,
      principal_type: "user",
      principal_id: userId,
      level: "edit" satisfies PermissionLevel,
      passcode_required: false,
    },
    { onConflict: "fs_node_id,principal_type,principal_id" },
  );
  if (error) throw error;
}

export async function rpcCanEditNode(
  supabase: SupabaseClient,
  nodeId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_edit_node", {
    p_node_id: nodeId,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function rpcCanViewNode(
  supabase: SupabaseClient,
  nodeId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_view_node", {
    p_node_id: nodeId,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function rpcCanDownloadNode(
  supabase: SupabaseClient,
  nodeId: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("can_download_node", {
    p_node_id: nodeId,
  });
  if (error) throw error;
  return Boolean(data);
}
