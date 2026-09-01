import { NextResponse } from "next/server";
import { requireUser, roleForSpace, logActivity } from "@/lib/auth";
import { canDownload, canEdit } from "@/lib/types";
import {
  FS_NODE_COLS,
  attachFsFavorites,
  attachFsNodeTags,
  basenamePath,
  joinRelative,
  parentRelativePath,
  setFsNodeTags,
} from "@/lib/fsNodes";
import {
  fsCopy,
  fsMove,
  fsPermanentDelete,
  fsRename,
  fsRestore,
  fsTrash,
} from "@/lib/fsClient";
import type { FsNode } from "@/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await context.params;
  const { data, error } = await supabase
    .from("fs_nodes")
    .select(FS_NODE_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let [node] = await attachFsNodeTags(supabase, [data as FsNode]);
  [node] = await attachFsFavorites(supabase, effectiveUserId, [node]);
  return NextResponse.json({ node });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    parent_id?: string | null;
    description?: string | null;
    created_by?: string | null;
    tags?: string[];
    copy_to_parent_id?: string | null;
    restore?: boolean;
  };

  const { data: node, error } = await supabase
    .from("fs_nodes")
    .select(FS_NODE_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error || !node) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", effectiveUserId);
  const role = roleForSpace(
    memberships ?? [],
    node.space_id,
    profile.is_admin,
  );
  if (!canEdit(role, profile.is_admin)) {
    return NextResponse.json({ error: "Editors only" }, { status: 403 });
  }

  try {
    if (body.restore) {
      await fsRestore(node.relative_path);
      const { data: restored, error: rErr } = await supabase
        .from("fs_nodes")
        .update({ is_deleted: false, deleted_at: null })
        .eq("id", id)
        .select(FS_NODE_COLS)
        .single();
      if (rErr) throw rErr;
      await logActivity(
        {
          user_id: user.id,
          space_id: node.space_id,
          action: "restore",
          target_type: "fs_node",
          target_id: id,
        },
        supabase,
      );
      return NextResponse.json({ node: restored });
    }

    if (typeof body.copy_to_parent_id !== "undefined") {
      let toDir = "";
      if (body.copy_to_parent_id) {
        const { data: dest } = await supabase
          .from("fs_nodes")
          .select("relative_path")
          .eq("id", body.copy_to_parent_id)
          .single();
        toDir = dest?.relative_path || "";
      } else {
        toDir = node.relative_path.split("/")[0] || "";
      }
      const result = await fsCopy(node.relative_path, toDir);
      const newPath = result.relative_path;
      const { data: parent } = await supabase
        .from("fs_nodes")
        .select("id")
        .eq("space_id", node.space_id)
        .eq("relative_path", parentRelativePath(newPath) || "")
        .maybeSingle();
      const { data: copied, error: cErr } = await supabase
        .from("fs_nodes")
        .insert({
          space_id: node.space_id,
          parent_id: parent?.id ?? null,
          node_type: node.node_type,
          name: basenamePath(newPath),
          relative_path: newPath,
          size_bytes: node.size_bytes,
          mime_type: node.mime_type,
          content_hash: node.content_hash,
          has_thumbnail: node.has_thumbnail,
          uploaded_by: user.id,
        })
        .select(FS_NODE_COLS)
        .single();
      if (cErr) throw cErr;
      return NextResponse.json({ node: copied }, { status: 201 });
    }

    let relativePath = node.relative_path as string;
    let parentId = node.parent_id as string | null;
    let name = node.name as string;

    if (typeof body.name === "string" && body.name.trim() && body.name !== node.name) {
      const result = await fsRename(relativePath, body.name.trim());
      relativePath = result.relative_path;
      name = body.name.trim();
    }

    if (
      typeof body.parent_id !== "undefined" &&
      body.parent_id !== node.parent_id
    ) {
      let toDir = "";
      if (body.parent_id) {
        const { data: dest } = await supabase
          .from("fs_nodes")
          .select("id,relative_path")
          .eq("id", body.parent_id)
          .single();
        if (!dest) {
          return NextResponse.json({ error: "Destination not found" }, { status: 404 });
        }
        toDir = dest.relative_path;
        parentId = dest.id;
      } else {
        toDir = relativePath.split("/")[0] || "";
        const { data: root } = await supabase
          .from("fs_nodes")
          .select("id")
          .eq("space_id", node.space_id)
          .eq("relative_path", toDir)
          .maybeSingle();
        parentId = root?.id ?? null;
      }
      const result = await fsMove(relativePath, toDir);
      relativePath = result.relative_path;
      name = basenamePath(relativePath);
    }

    const patch: Record<string, unknown> = {
      name,
      relative_path: relativePath,
      parent_id: parentId,
    };
    if (typeof body.description === "string" || body.description === null) {
      patch.description = body.description;
    }
    if (typeof body.created_by === "string" || body.created_by === null) {
      patch.created_by = body.created_by;
    }

    const { data: updated, error: uErr } = await supabase
      .from("fs_nodes")
      .update(patch)
      .eq("id", id)
      .select(FS_NODE_COLS)
      .single();
    if (uErr) throw uErr;

    if (Array.isArray(body.tags)) {
      await setFsNodeTags(supabase, id, body.tags.map(String), true);
    }

    const [withTags] = await attachFsNodeTags(supabase, [updated as FsNode]);
    return NextResponse.json({ node: withTags });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await context.params;
  const url = new URL(request.url);
  const permanent = url.searchParams.get("permanent") === "1";

  const { data: node, error } = await supabase
    .from("fs_nodes")
    .select(FS_NODE_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error || !node) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", effectiveUserId);
  const role = roleForSpace(
    memberships ?? [],
    node.space_id,
    profile.is_admin,
  );
  if (!canEdit(role, profile.is_admin)) {
    return NextResponse.json({ error: "Editors only" }, { status: 403 });
  }

  try {
    if (permanent) {
      if (!node.is_deleted) {
        return NextResponse.json(
          { error: "Permanent delete only from trash" },
          { status: 400 },
        );
      }
      await fsPermanentDelete(node.relative_path);
      await supabase.from("fs_nodes").delete().eq("id", id);
    } else {
      await fsTrash(node.relative_path);
      await supabase
        .from("fs_nodes")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq("id", id);
    }
    await logActivity(
      {
        user_id: user.id,
        space_id: node.space_id,
        action: permanent ? "permanent_delete" : "trash",
        target_type: "fs_node",
        target_id: id,
        details: { relative_path: node.relative_path },
      },
      supabase,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 400 },
    );
  }
}

// keep download capability check available for media route
void canDownload;
void joinRelative;
