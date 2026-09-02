import { NextResponse } from "next/server";
import { requireDrive, logActivity } from "@/lib/auth";
import { FS_NODE_COLS } from "@/lib/fsNodes";
import { fsPermanentDelete } from "@/lib/fsClient";
import type { FsNode } from "@/lib/types";

export const runtime = "nodejs";

/** Permanently delete every trashed fs_node. */
export async function POST(request: Request) {
  const { profile, effectiveUserId, supabase } = await requireDrive(request);
  if (!profile || !effectiveUserId) {
    return NextResponse.json({ error: "Portal not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("fs_nodes")
    .select(FS_NODE_COLS)
    .eq("is_deleted", true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const nodes = (data ?? []) as FsNode[];
  const failures: { id: string; name: string; error: string }[] = [];
  let deleted = 0;

  for (const node of nodes) {
    try {
      await fsPermanentDelete(node.relative_path);
      const { error: delErr } = await supabase
        .from("fs_nodes")
        .delete()
        .eq("id", node.id);
      if (delErr) throw new Error(delErr.message);
      deleted += 1;
    } catch (err) {
      failures.push({
        id: node.id,
        name: node.name,
        error: err instanceof Error ? err.message : "Delete failed",
      });
    }
  }

  await logActivity(
    {
      user_id: effectiveUserId,
      action: "empty_trash",
      target_type: "fs_trash",
      details: { deleted, failed: failures.length },
    },
    supabase,
  );

  return NextResponse.json({
    ok: failures.length === 0,
    deleted,
    failures,
  });
}
