import { NextResponse } from "next/server";
import { requireUser, logActivity, roleForSpace } from "@/lib/auth";
import { canEdit } from "@/lib/types";
import { listAssetEntities } from "@/lib/entities";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const { user, supabase } = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const entities = await listAssetEntities(supabase, id);
    return NextResponse.json({ entities });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request, context: Ctx) {
  const { user, profile, supabase, effectiveUserId } = await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id: assetId } = await context.params;
  const body = (await request.json()) as {
    entity_id?: string;
    relation_label?: string | null;
  };

  if (!body.entity_id) {
    return NextResponse.json({ error: "entity_id is required" }, { status: 400 });
  }

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

  const { error } = await supabase.from("asset_entities").upsert(
    {
      asset_id: assetId,
      entity_id: body.entity_id,
      relation_label: body.relation_label ?? null,
      created_by: effectiveUserId,
    },
    { onConflict: "asset_id,entity_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logActivity(
    {
      user_id: user.id,
      space_id: asset.space_id,
      action: "link_entity",
      target_type: "asset",
      target_id: assetId,
      details: { entity_id: body.entity_id },
    },
    supabase,
  );

  const entities = await listAssetEntities(supabase, assetId);
  return NextResponse.json({ entities });
}
