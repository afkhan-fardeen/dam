import { NextResponse } from "next/server";
import { requireUser, logActivity } from "@/lib/auth";
import { attachTags, filterUnlockedAssets } from "@/lib/search";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { Asset } from "@/lib/types";

export const runtime = "nodejs";

const ASSET_COLS =
  "id,file_id,original_name,mime_type,size,space_id,folder_id,description,created_by,uploaded_by,has_thumbnail,status,created_at,tags_text";

function dbForFavorites(effectiveUserId: string, realUserId: string) {
  if (effectiveUserId !== realUserId) return getSupabaseAdmin();
  return null;
}

export async function GET(request: Request) {
  const { user, effectiveUserId, supabase } = await requireUser(request);
  if (!user || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const client = dbForFavorites(effectiveUserId, user.id) ?? supabase;

  const { data: favs, error } = await client
    .from("asset_favorites")
    .select("asset_id,created_at")
    .eq("user_id", effectiveUserId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (favs ?? []).map((f) => f.asset_id as string);
  if (ids.length === 0) {
    return NextResponse.json({ assets: [], count: 0 });
  }

  const { data: assets, error: assetsError } = await supabase
    .from("assets")
    .select(ASSET_COLS)
    .in("id", ids)
    .eq("status", "active");

  if (assetsError) {
    return NextResponse.json({ error: assetsError.message }, { status: 500 });
  }

  const order = new Map(ids.map((id, i) => [id, i]));
  const sorted = ((assets ?? []) as Asset[]).sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );

  const withTags = await attachTags(supabase, sorted);
  const unlocked = await filterUnlockedAssets(
    supabase,
    effectiveUserId,
    withTags.map((a) => ({ ...a, favorited: true })),
  );

  return NextResponse.json({ assets: unlocked, count: unlocked.length });
}

export async function POST(request: Request) {
  const { user, effectiveUserId, supabase } = await requireUser(request);
  if (!user || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await request.json()) as { asset_id?: string };
  if (!body.asset_id) {
    return NextResponse.json({ error: "asset_id is required" }, { status: 400 });
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id,space_id,original_name,status")
    .eq("id", body.asset_id)
    .single();

  if (!asset || asset.status === "deleted") {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const client = dbForFavorites(effectiveUserId, user.id) ?? supabase;
  const { error } = await client.from("asset_favorites").upsert(
    { user_id: effectiveUserId, asset_id: asset.id },
    { onConflict: "user_id,asset_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(
    {
      user_id: user.id,
      space_id: asset.space_id,
      action: "favorite",
      target_type: "asset",
      target_id: asset.id,
      details: { original_name: asset.original_name },
    },
    supabase,
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { user, effectiveUserId, supabase } = await requireUser(request);
  if (!user || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const assetId = new URL(request.url).searchParams.get("asset_id");
  if (!assetId) {
    return NextResponse.json({ error: "asset_id is required" }, { status: 400 });
  }

  const client = dbForFavorites(effectiveUserId, user.id) ?? supabase;
  const { error } = await client
    .from("asset_favorites")
    .delete()
    .eq("user_id", effectiveUserId)
    .eq("asset_id", assetId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
