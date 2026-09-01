import { NextResponse } from "next/server";
import { requireUser, roleForSpace } from "@/lib/auth";
import { canEdit } from "@/lib/types";
import {
  FS_NODE_COLS,
  attachFsFavorites,
  attachFsNodeTags,
  ensureSpaceRootNode,
  joinRelative,
  listFsChildren,
  resolveParentFolderId,
  spaceRootPath,
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
  const spaceId = url.searchParams.get("space_id");
  const parentIdParam = url.searchParams.get("parent_id");
  const trash = url.searchParams.get("trash") === "1";
  const foldersOnly = url.searchParams.get("folders") === "1";

  if (!spaceId) {
    return NextResponse.json({ error: "space_id required" }, { status: 400 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", effectiveUserId);
  const role = roleForSpace(memberships ?? [], spaceId, profile.is_admin);
  if (!role && !profile.is_admin) {
    return NextResponse.json({ error: "No access" }, { status: 403 });
  }

  const { data: space } = await supabase
    .from("spaces")
    .select("id,slug")
    .eq("id", spaceId)
    .single();
  if (!space) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  let nodes: FsNode[];
  if (trash) {
    const { data, error } = await supabase
      .from("fs_nodes")
      .select(FS_NODE_COLS)
      .eq("space_id", spaceId)
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
      .eq("space_id", spaceId)
      .eq("node_type", "folder")
      .eq("is_deleted", false)
      .neq("relative_path", spaceRootPath(space.slug))
      .order("relative_path", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    nodes = (data ?? []) as FsNode[];
  } else {
    try {
      const { parentId } = await resolveParentFolderId(
        supabase,
        spaceId,
        space.slug,
        parentIdParam || null,
      );
      nodes = await listFsChildren(supabase, {
        spaceId,
        parentId,
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
    space_id?: string;
    parent_id?: string | null;
    name?: string;
  };
  const spaceId = body.space_id;
  const name = body.name?.trim();
  if (!spaceId || !name) {
    return NextResponse.json(
      { error: "space_id and name required" },
      { status: 400 },
    );
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", effectiveUserId);
  const role = roleForSpace(memberships ?? [], spaceId, profile.is_admin);
  if (!canEdit(role, profile.is_admin)) {
    return NextResponse.json({ error: "Editors only" }, { status: 403 });
  }

  const { data: space } = await supabase
    .from("spaces")
    .select("id,slug")
    .eq("id", spaceId)
    .single();
  if (!space) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  let parentId: string;
  let parentPath: string;
  try {
    ({ parentId, parentPath } = await resolveParentFolderId(
      supabase,
      spaceId,
      space.slug,
      body.parent_id,
    ));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Parent not found" },
      { status: 404 },
    );
  }

  // Touch ensure so root row always exists even if resolve skipped mkdir
  await ensureSpaceRootNode(supabase, spaceId, space.slug);

  const relativePath = joinRelative(parentPath, name);
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
      space_id: spaceId,
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

  return NextResponse.json({ node }, { status: 201 });
}
