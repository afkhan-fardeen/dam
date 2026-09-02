import { NextResponse } from "next/server";
import { requireDrive, logActivity } from "@/lib/auth";
import {
  FS_NODE_COLS,
  attachFolderSizes,
  attachFsFavorites,
  attachFsNodeTags,
  grantCreatorEdit,
  joinRelative,
  listFsChildren,
  resolveParentFolder,
  setFsNodeTags,
} from "@/lib/fsNodes";
import { fsMkdir } from "@/lib/fsClient";
import type { FsNode } from "@/lib/types";

export const runtime = "nodejs";

async function loadAncestorChain(
  supabase: Awaited<ReturnType<typeof requireDrive>>["supabase"],
  folderId: string,
): Promise<FsNode[]> {
  const chain: FsNode[] = [];
  let cur: string | null = folderId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const { data, error } = await supabase
      .from("fs_nodes")
      .select(FS_NODE_COLS)
      .eq("id", cur)
      .maybeSingle();
    if (error || !data) break;
    const node = data as FsNode;
    chain.unshift(node);
    cur = node.parent_id;
  }
  return chain;
}

export async function GET(request: Request) {
  const { profile, effectiveUserId, supabase } = await requireDrive(request);
  if (!profile || !effectiveUserId) {
    return NextResponse.json({ error: "Portal not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const parentIdParam = url.searchParams.get("parent_id");
  const trash = url.searchParams.get("trash") === "1";
  const foldersOnly = url.searchParams.get("folders") === "1";

  let nodes: FsNode[];
  let ancestors: FsNode[] = [];

  if (trash) {
    const { data, error } = await supabase
      .from("fs_nodes")
      .select(FS_NODE_COLS)
      .eq("is_deleted", true)
      .order("deleted_at", { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    nodes = (data ?? []) as FsNode[];
  } else if (foldersOnly) {
    const { data, error } = await supabase
      .from("fs_nodes")
      .select(FS_NODE_COLS)
      .eq("node_type", "folder")
      .eq("is_deleted", false)
      .order("relative_path", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    nodes = (data ?? []) as FsNode[];
  } else {
    try {
      const parentId =
        parentIdParam &&
        parentIdParam !== "null" &&
        parentIdParam !== "undefined"
          ? parentIdParam
          : null;
      if (
        parentId &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          parentId,
        )
      ) {
        return NextResponse.json(
          { error: "Invalid folder id" },
          { status: 400 },
        );
      }
      nodes = await listFsChildren(supabase, { parentId });
      if (parentId) {
        ancestors = await loadAncestorChain(supabase, parentId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "List failed";
      console.error("[fs/list]", message);
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  try {
    nodes = await attachFsNodeTags(supabase, nodes);
    nodes = await attachFsFavorites(supabase, effectiveUserId, nodes);
    if (!foldersOnly) {
      nodes = await attachFolderSizes(supabase, nodes);
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Enrichment failed";
    console.error("[fs/list] enrich", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ nodes, ancestors });
}

export async function POST(request: Request) {
  const { profile, effectiveUserId, supabase } = await requireDrive(request);
  if (!profile || !effectiveUserId) {
    return NextResponse.json({ error: "Portal not configured" }, { status: 503 });
  }

  const body = (await request.json()) as {
    parent_id?: string | null;
    name?: string;
    description?: string | null;
    tags?: string[];
  };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  let parentId: string | null;
  let parentPath: string;
  try {
    ({ parentId, parentPath } = await resolveParentFolder(
      supabase,
      body.parent_id,
    ));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Parent not found" },
      { status: 404 },
    );
  }

  const relativePath = parentPath ? joinRelative(parentPath, name) : name;
  try {
    await fsMkdir(relativePath);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Mkdir failed" },
      { status: 400 },
    );
  }

  const description =
    typeof body.description === "string" ? body.description.trim() || null : null;

  const { data: node, error } = await supabase
    .from("fs_nodes")
    .insert({
      parent_id: parentId,
      node_type: "folder",
      name,
      relative_path: relativePath,
      description,
      uploaded_by: effectiveUserId,
      is_deleted: false,
    })
    .select(FS_NODE_COLS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await grantCreatorEdit(supabase, node.id, effectiveUserId);
    if (Array.isArray(body.tags) && body.tags.length > 0) {
      await setFsNodeTags(supabase, node.id, body.tags, true);
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Folder created but metadata failed",
      },
      { status: 500 },
    );
  }

  let result = node as FsNode;
  try {
    const enriched = await attachFsNodeTags(supabase, [result]);
    result = enriched[0] ?? result;
  } catch {
    /* ignore */
  }

  await logActivity(
    {
      user_id: effectiveUserId,
      action: "create_folder",
      target_type: "fs_node",
      target_id: result.id,
      details: { name: result.name, relative_path: result.relative_path },
    },
    supabase,
  );

  return NextResponse.json({ node: result }, { status: 201 });
}
