import { NextResponse } from "next/server";
import { requireUser, logActivity, roleForSpace } from "@/lib/auth";
import { canEdit } from "@/lib/types";
import {
  getAssetAttributes,
  getAttributeDefs,
  upsertAssetAttributes,
} from "@/lib/attributes";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const { user, supabase } = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    const values = await getAssetAttributes(supabase, id);
    const defs = await getAttributeDefs(supabase);
    return NextResponse.json({ values, defs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, context: Ctx) {
  const { user, profile, supabase, effectiveUserId } = await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id: assetId } = await context.params;
  const body = (await request.json()) as {
    values?: { attribute_def_id: string; value: unknown }[];
  };

  if (!Array.isArray(body.values)) {
    return NextResponse.json({ error: "values array required" }, { status: 400 });
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

  try {
    const defs = await getAttributeDefs(supabase, { includeArchived: true });
    await upsertAssetAttributes(supabase, assetId, body.values, defs);
    await logActivity(
      {
        user_id: user.id,
        space_id: asset.space_id,
        action: "update_attributes",
        target_type: "asset",
        target_id: assetId,
        details: { count: body.values.length },
      },
      supabase,
    );
    const values = await getAssetAttributes(supabase, assetId);
    return NextResponse.json({ values });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
