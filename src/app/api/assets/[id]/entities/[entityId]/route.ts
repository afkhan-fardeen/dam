import { NextResponse } from "next/server";
import { requireUser, logActivity, roleForSpace } from "@/lib/auth";
import { canEdit } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; entityId: string }> };

export async function DELETE(request: Request, context: Ctx) {
  const { user, profile, supabase, effectiveUserId } = await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id: assetId, entityId } = await context.params;

  const { data: asset } = await supabase
    .from("assets")
    .select("id,space_id")
    .eq("id", assetId)
    .single();

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", effectiveUserId);

  const role = roleForSpace(
    memberships ?? [],
    asset.space_id,
    profile.is_admin,
  );
  if (!canEdit(role, profile.is_admin)) {
    return NextResponse.json({ error: "Editors only" }, { status: 403 });
  }

  const { error } = await supabase
    .from("asset_entities")
    .delete()
    .eq("asset_id", assetId)
    .eq("entity_id", entityId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logActivity(
    {
      user_id: user.id,
      space_id: asset.space_id,
      action: "unlink_entity",
      target_type: "asset",
      target_id: assetId,
      details: { entity_id: entityId },
    },
    supabase,
  );

  return NextResponse.json({ ok: true });
}
