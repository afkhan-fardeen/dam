import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  FS_NODE_COLS,
  attachFsFavorites,
  attachFsNodeTags,
} from "@/lib/fsNodes";
import type { FsNode } from "@/lib/types";

export const runtime = "nodejs";

/** Cross-space browse: recent / trash / starred / all files from fs_nodes. */
export async function GET(request: Request) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const url = new URL(request.url);
  const view = url.searchParams.get("view") || "all";
  const spaceId = url.searchParams.get("space_id");
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") || "48") || 48),
  );

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("space_id")
    .eq("user_id", effectiveUserId);

  const memberSpaceIds = [
    ...new Set((memberships ?? []).map((m) => m.space_id as string)),
  ];

  const allSpaceIds = profile.is_admin
    ? (
        await supabase.from("spaces").select("id").eq("status", "active")
      ).data?.map((b) => b.id as string) ?? memberSpaceIds
    : memberSpaceIds;

  const allowed = spaceId
    ? allSpaceIds.includes(spaceId)
      ? [spaceId]
      : []
    : allSpaceIds;

  if (allowed.length === 0) {
    return NextResponse.json({ nodes: [], count: 0, view });
  }

  let nodes: FsNode[] = [];

  if (view === "starred" || view === "favorites") {
    const { data: favs } = await supabase
      .from("fs_node_favorites")
      .select("fs_node_id,created_at")
      .eq("user_id", effectiveUserId)
      .order("created_at", { ascending: false })
      .limit(limit);
    const ids = (favs ?? []).map((f) => f.fs_node_id as string);
    if (ids.length === 0) {
      return NextResponse.json({ nodes: [], count: 0, view: "starred" });
    }
    const { data, error } = await supabase
      .from("fs_nodes")
      .select(FS_NODE_COLS)
      .in("id", ids)
      .in("space_id", allowed)
      .eq("is_deleted", false)
      .eq("node_type", "file");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const order = new Map(ids.map((id, i) => [id, i]));
    nodes = ((data ?? []) as FsNode[]).sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
  } else if (view === "trash") {
    const { data, error } = await supabase
      .from("fs_nodes")
      .select(FS_NODE_COLS)
      .in("space_id", allowed)
      .eq("is_deleted", true)
      .order("deleted_at", { ascending: false })
      .limit(limit);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    nodes = (data ?? []) as FsNode[];
  } else if (view === "recent") {
    const { data, error } = await supabase
      .from("fs_nodes")
      .select(FS_NODE_COLS)
      .in("space_id", allowed)
      .eq("is_deleted", false)
      .eq("node_type", "file")
      .order("updated_at", { ascending: false })
      .limit(limit);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    nodes = (data ?? []) as FsNode[];
  } else {
    const { data, error } = await supabase
      .from("fs_nodes")
      .select(FS_NODE_COLS)
      .in("space_id", allowed)
      .eq("is_deleted", false)
      .eq("node_type", "file")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    nodes = (data ?? []) as FsNode[];
  }

  nodes = await attachFsNodeTags(supabase, nodes);
  nodes = await attachFsFavorites(supabase, effectiveUserId, nodes);
  if (view === "starred" || view === "favorites") {
    nodes = nodes.map((n) => ({ ...n, favorited: true }));
  }

  return NextResponse.json({ nodes, count: nodes.length, view });
}
