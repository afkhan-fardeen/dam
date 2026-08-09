import { NextResponse } from "next/server";
import { requireUser, roleForSpace } from "@/lib/auth";
import { canEdit } from "@/lib/types";

export const runtime = "nodejs";

/** Store OCR / extracted text for FTS (Phase H). */
export async function PUT(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { user, profile, supabase } = await requireUser(request);
  if (!user || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const body = (await request.json()) as { text?: string };
  const text = body.text?.trim() || "";

  const { data: asset } = await supabase
    .from("assets")
    .select("id,space_id")
    .eq("id", id)
    .maybeSingle();
  if (!asset) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", user.id);
  const role = roleForSpace(
    memberships ?? [],
    asset.space_id as string,
    profile.is_admin,
  );
  if (!canEdit(role, profile.is_admin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("assets")
    .update({ extracted_text: text || null })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
