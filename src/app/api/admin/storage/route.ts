import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { fsStorageStatus } from "@/lib/fsClient";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  let live: {
    total_bytes: number;
    used_bytes: number;
    available_bytes: number;
    storage_root: string;
    checked_at: string;
  } | null = null;

  try {
    live = await fsStorageStatus();
    const admin = getSupabaseAdmin();
    await admin.from("storage_status").upsert({
      id: 1,
      total_bytes: live.total_bytes,
      used_bytes: live.used_bytes,
      available_bytes: live.available_bytes,
      storage_root: live.storage_root,
      checked_at: live.checked_at,
    });
  } catch {
    const { data } = await supabase
      .from("storage_status")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (data) {
      live = {
        total_bytes: Number(data.total_bytes),
        used_bytes: Number(data.used_bytes),
        available_bytes: Number(data.available_bytes),
        storage_root: String(data.storage_root || ""),
        checked_at: String(data.checked_at || ""),
      };
    }
  }

  const { data: spaces } = await supabase
    .from("spaces")
    .select("id,name,color,status")
    .order("name");

  const { data: nodes } = await supabase
    .from("fs_nodes")
    .select("space_id,size_bytes,is_deleted,node_type")
    .eq("is_deleted", false)
    .eq("node_type", "file");

  const bySpace = new Map<string, number>();
  for (const n of nodes ?? []) {
    if (!n.space_id) continue;
    bySpace.set(
      n.space_id,
      (bySpace.get(n.space_id) || 0) + Number(n.size_bytes || 0),
    );
  }

  const usage = (spaces ?? []).map((s) => ({
    space_id: s.id,
    name: s.name,
    color: s.color,
    status: s.status,
    bytes: bySpace.get(s.id) || 0,
  }));

  return NextResponse.json({
    disk: live,
    usage,
  });
}
