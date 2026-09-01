import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id } = await context.params;
  const { data: group, error } = await supabase
    .from("access_groups")
    .select("id,name,created_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !group) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { data: members } = await supabase
    .from("access_group_members")
    .select("user_id,profiles(id,full_name,email)")
    .eq("group_id", id);
  return NextResponse.json({ group, members: members ?? [] });
}

export async function PATCH(request: Request, context: RouteContext) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id } = await context.params;
  const body = (await request.json()) as { name?: string };
  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("access_groups")
    .update({ name: body.name.trim() })
    .eq("id", id)
    .select("id,name,created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ group: data });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { id } = await context.params;
  const { data: group } = await supabase
    .from("access_groups")
    .select("name")
    .eq("id", id)
    .maybeSingle();
  if (group?.name === "Everyone") {
    return NextResponse.json(
      { error: "Cannot delete the Everyone group" },
      { status: 400 },
    );
  }
  const { error } = await supabase.from("access_groups").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
