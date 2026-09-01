import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { data, error } = await supabase
    .from("access_groups")
    .select("id,name,created_at")
    .order("name");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ groups: data ?? [] });
}

export async function POST(request: Request) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const body = (await request.json()) as { name?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("access_groups")
    .insert({ name })
    .select("id,name,created_at")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ group: data }, { status: 201 });
}
