import { NextResponse } from "next/server";
import { requireDrive, logActivity } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user, effectiveUserId, supabase } = await requireDrive(request);
  if (!effectiveUserId) {
    return NextResponse.json({ error: "Portal not configured" }, { status: 503 });
  }
  const body = (await request.json()) as { fs_node_id?: string };
  if (!body.fs_node_id) {
    return NextResponse.json({ error: "fs_node_id required" }, { status: 400 });
  }
  const { error } = await supabase.from("fs_node_favorites").upsert(
    { user_id: effectiveUserId, fs_node_id: body.fs_node_id },
    { onConflict: "user_id,fs_node_id" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await logActivity(
    {
      user_id: effectiveUserId,
      action: "favorite",
      target_type: "fs_node",
      target_id: body.fs_node_id,
    },
    supabase,
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { user, effectiveUserId, supabase } = await requireDrive(request);
  if (!effectiveUserId) {
    return NextResponse.json({ error: "Portal not configured" }, { status: 503 });
  }
  const fsNodeId = new URL(request.url).searchParams.get("fs_node_id");
  if (!fsNodeId) {
    return NextResponse.json({ error: "fs_node_id required" }, { status: 400 });
  }
  const { error } = await supabase
    .from("fs_node_favorites")
    .delete()
    .eq("user_id", effectiveUserId)
    .eq("fs_node_id", fsNodeId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
