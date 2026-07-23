import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { data: spaces } = await supabase
    .from("spaces")
    .select("id,name,color,status")
    .order("name");

  const { data: assets } = await supabase
    .from("assets")
    .select("space_id,size,status")
    .eq("status", "active");

  const bySpace = new Map<string, number>();
  for (const a of assets ?? []) {
    if (!a.space_id) continue;
    bySpace.set(
      a.space_id,
      (bySpace.get(a.space_id) || 0) + Number(a.size || 0),
    );
  }

  const usage = (spaces ?? []).map((s) => ({
    space_id: s.id,
    name: s.name,
    color: s.color,
    status: s.status,
    bytes: bySpace.get(s.id) || 0,
  }));

  return NextResponse.json({ usage });
}
