import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  FS_NODE_COLS,
  attachFsFavorites,
  attachFsNodeTags,
  grantCreatorEdit,
  joinRelative,
  listFsChildren,
  resolveParentFolder,
} from "@/lib/fsNodes";
import { fsMkdir } from "@/lib/fsClient";
import type { FsNode } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parentIdParam = url.searchParams.get("parent_id");
  const trash = url.searchParams.get("trash") === "1";
  const foldersOnly = url.searchParams.get("folders") === "1";

  let nodes: FsNode[];
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
      nodes = await listFsChildren(supabase, {
        parentId: parentIdParam || null,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "List failed" },
        { status: 400 },
      );
    }
  }

  nodes = await attachFsNodeTags(supabase, nodes);
  nodes = await attachFsFavorites(supabase, effectiveUserId, nodes);

  return NextResponse.json({ nodes });
}

export async function POST(request: Request) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await request.json()) as {
    parent_id?: string | null;
    name?: string;
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

  if (parentId) {
    // Open drive: any signed-in user may create in any folder
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

  const { data: node, error } = await supabase
    .from("fs_nodes")
    .insert({
      parent_id: parentId,
      node_type: "folder",
      name,
      relative_path: relativePath,
      uploaded_by: user.id,
      is_deleted: false,
    })
    .select(FS_NODE_COLS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await grantCreatorEdit(supabase, node.id, effectiveUserId);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Folder created but permission grant failed",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ node }, { status: 201 });
}
