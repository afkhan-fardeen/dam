import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id } = await context.params;
  const body = (await request.json()) as { user_id?: string };
  if (!body.user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }
  const { error } = await supabase.from("access_group_members").upsert(
    { group_id: id, user_id: body.user_id },
    { onConflict: "group_id,user_id" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id } = await context.params;
  const userId = new URL(request.url).searchParams.get("user_id");
  if (!userId) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }
  const { error } = await supabase
    .from("access_group_members")
    .delete()
    .eq("group_id", id)
    .eq("user_id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
