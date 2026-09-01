import { NextResponse } from "next/server";
import { requireUser, roleForSpace } from "@/lib/auth";
import {
  FS_NODE_COLS,
  attachFsFavorites,
  attachFsNodeTags,
} from "@/lib/fsNodes";
import type { FsNode } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const spaceId = url.searchParams.get("space_id");
  if (!q) {
    return NextResponse.json({ nodes: [], count: 0 });
  }

  let query = supabase
    .from("fs_nodes")
    .select(FS_NODE_COLS)
    .eq("is_deleted", false)
    .or(
      `name.ilike.%${q}%,relative_path.ilike.%${q}%,tags_text.ilike.%${q}%,description.ilike.%${q}%`,
    )
    .limit(40);

  if (spaceId) {
    const { data: memberships } = await supabase
      .from("space_memberships")
      .select("id,space_id,user_id,role,created_at")
      .eq("user_id", effectiveUserId);
    const role = roleForSpace(memberships ?? [], spaceId, profile.is_admin);
    if (!role && !profile.is_admin) {
      return NextResponse.json({ error: "No access" }, { status: 403 });
    }
    query = query.eq("space_id", spaceId);
  }

  const { data, error } = await query;
  if (error) {
    // Fallback RPC if available
    if (spaceId) {
      const { data: rpcData, error: rpcErr } = await supabase.rpc(
        "search_fs_nodes_trgm",
        { q, p_space_id: spaceId },
      );
      if (rpcErr) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      let nodes = (rpcData ?? []) as FsNode[];
      nodes = await attachFsNodeTags(supabase, nodes);
      nodes = await attachFsFavorites(supabase, effectiveUserId, nodes);
      return NextResponse.json({ nodes, count: nodes.length });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let nodes = (data ?? []) as FsNode[];
  nodes = await attachFsNodeTags(supabase, nodes);
  nodes = await attachFsFavorites(supabase, effectiveUserId, nodes);
  return NextResponse.json({ nodes, count: nodes.length });
}
