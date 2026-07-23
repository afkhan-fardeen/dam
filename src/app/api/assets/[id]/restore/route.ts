import { NextResponse } from "next/server";
import { requireUser, logActivity, roleForSpace } from "@/lib/auth";
import { canEdit } from "@/lib/types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { user, profile, supabase } = await requireUser(request);
  if (!user || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await context.params;
  const { data: asset, error: fetchError } = await supabase
    .from("assets")
    .select("id,space_id,status")
    .eq("id", id)
    .single();

  if (fetchError || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", user.id);

  const role = roleForSpace(memberships ?? [], asset.space_id, profile.is_admin);
  if (!canEdit(role, profile.is_admin)) {
    return NextResponse.json({ error: "You cannot restore files here" }, { status: 403 });
  }

  const { error: updateError } = await supabase
    .from("assets")
    .update({ status: "active" })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await logActivity(
    {
      user_id: user.id,
      space_id: asset.space_id,
      action: "upload",
      target_type: "asset",
      target_id: id,
      details: { restored: true },
    },
    supabase,
  );

  return NextResponse.json({ ok: true });
}
