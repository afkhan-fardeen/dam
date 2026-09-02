import { NextResponse } from "next/server";
import { requireDrive, logActivity } from "@/lib/auth";
import {
  FS_NODE_COLS,
  grantCreatorEdit,
  joinRelative,
  normalizeRelativePath,
  resolveParentFolder,
  setFsNodeTags,
} from "@/lib/fsNodes";
import { fsMkdir } from "@/lib/fsClient";
import type { FsNode } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Ensure a folder path exists under parent_id (creates missing segments).
 * Body: { parent_id?, path: "Album/sub", description?, tags?, name? }
 * - `path` may include nested folders separated by /
 * - tags/description apply only to the **first** (root) segment
 * - optional `name` renames the root segment only
 */
export async function POST(request: Request) {
  const { profile, effectiveUserId, supabase } = await requireDrive(request);
  if (!profile || !effectiveUserId) {
    return NextResponse.json({ error: "Portal not configured" }, { status: 503 });
  }

  const body = (await request.json()) as {
    parent_id?: string | null;
    path?: string;
    name?: string;
    description?: string | null;
    tags?: string[];
  };

  const rawPath = String(body.path || "").trim();
  if (!rawPath) {
    return NextResponse.json({ error: "path required" }, { status: 400 });
  }

  const segments = normalizeRelativePath(rawPath)
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  if (typeof body.name === "string" && body.name.trim()) {
    const renamed = body.name.trim();
    if (renamed.includes("/") || renamed.includes("\\") || renamed.includes("..")) {
      return NextResponse.json({ error: "Invalid folder name" }, { status: 400 });
    }
    segments[0] = renamed;
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

  const description =
    typeof body.description === "string"
      ? body.description.trim() || null
      : body.description === null
        ? null
        : undefined;
  const tags = Array.isArray(body.tags)
    ? body.tags.map(String).map((t) => t.trim()).filter(Boolean)
    : [];

  const created: FsNode[] = [];
  let currentParentId = parentId;
  let currentPath = parentPath;
  let rootNode: FsNode | null = null;

  for (let i = 0; i < segments.length; i++) {
    const name = segments[i]!;
    const relativePath = currentPath ? joinRelative(currentPath, name) : name;

    const { data: existing } = await supabase
      .from("fs_nodes")
      .select(FS_NODE_COLS)
      .eq("relative_path", relativePath)
      .eq("is_deleted", false)
      .maybeSingle();

    if (existing) {
      if (existing.node_type !== "folder") {
        return NextResponse.json(
          { error: `Path conflict: ${relativePath} is a file` },
          { status: 409 },
        );
      }
      currentParentId = existing.id;
      currentPath = relativePath;
      if (i === 0) rootNode = existing as FsNode;
      continue;
    }

    try {
      await fsMkdir(relativePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mkdir failed";
      // Race: another create may have landed — continue if row appears
      if (!/exist/i.test(message)) {
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }

    const patch: Record<string, unknown> = {
      parent_id: currentParentId,
      node_type: "folder",
      name,
      relative_path: relativePath,
      uploaded_by: effectiveUserId,
      is_deleted: false,
    };
    if (i === 0 && description !== undefined) {
      patch.description = description;
    }

    const { data: node, error } = await supabase
      .from("fs_nodes")
      .upsert(patch, { onConflict: "relative_path" })
      .select(FS_NODE_COLS)
      .single();

    if (error || !node) {
      return NextResponse.json(
        { error: error?.message || "Could not create folder" },
        { status: 500 },
      );
    }

    try {
      await grantCreatorEdit(supabase, node.id, effectiveUserId);
      if (i === 0 && tags.length > 0) {
        await setFsNodeTags(supabase, node.id, tags, true);
      }
    } catch {
      /* non-fatal for ensure */
    }

    created.push(node as FsNode);
    if (i === 0) rootNode = node as FsNode;
    currentParentId = node.id;
    currentPath = relativePath;
  }

  if (rootNode && (description !== undefined || tags.length > 0)) {
    const updates: Record<string, unknown> = {};
    if (description !== undefined) updates.description = description;
    if (Object.keys(updates).length > 0) {
      await supabase.from("fs_nodes").update(updates).eq("id", rootNode.id);
    }
    if (tags.length > 0) {
      try {
        await setFsNodeTags(supabase, rootNode.id, tags, true);
      } catch {
        /* ignore */
      }
    }
  }

  await logActivity(
    {
      user_id: effectiveUserId,
      action: "ensure_folder",
      target_type: "fs_node",
      target_id: currentParentId,
      details: { path: currentPath, created: created.length },
    },
    supabase,
  );

  return NextResponse.json({
    folder_id: currentParentId,
    relative_path: currentPath,
    root_folder_id: rootNode?.id ?? currentParentId,
    created: created.length,
  });
}
