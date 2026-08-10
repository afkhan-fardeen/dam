import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser, roleForSpace } from "@/lib/auth";
import { canEdit } from "@/lib/types";
import {
  attachFavorites,
  countTrashAssets,
  listTrashAssetRefs,
  listTrashAssets,
} from "@/lib/search";

export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;

async function trashSpaceIds(
  supabase: SupabaseClient,
  effectiveUserId: string,
  isAdmin: boolean,
  spaceId: string | null,
): Promise<string[]> {
  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", effectiveUserId);

  if (spaceId) {
    const role = roleForSpace(memberships ?? [], spaceId, isAdmin);
    if (!canEdit(role, isAdmin)) return [];
    return [spaceId];
  }

  if (isAdmin) {
    const { data: spaces } = await supabase
      .from("spaces")
      .select("id")
      .eq("status", "active");
    return (spaces ?? []).map((s) => s.id as string);
  }

  return (memberships ?? [])
    .filter((m) => m.role === "editor")
    .map((m) => m.space_id as string);
}

/** Paginated trash listing with true total count. */
export async function GET(request: Request) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get("space_id");
    const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        Number(searchParams.get("limit") || String(DEFAULT_PAGE_SIZE)) ||
          DEFAULT_PAGE_SIZE,
      ),
    );
    const spaceIds = await trashSpaceIds(
      supabase,
      effectiveUserId,
      profile.is_admin,
      spaceId,
    );

    if (spaceIds.length === 0) {
      return NextResponse.json({
        assets: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
      });
    }

    const total = await countTrashAssets(supabase, { spaceIds });
    const offset = (page - 1) * pageSize;
    const assets = await listTrashAssets(supabase, {
      spaceIds,
      limit: pageSize,
      offset,
    });
    const favorited = await attachFavorites(
      supabase,
      effectiveUserId,
      assets,
    );

    return NextResponse.json({
      assets: favorited,
      total,
      page,
      pageSize,
      hasMore: offset + favorited.length < total,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load trash.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Returns every trashed item the user can permanently delete.
 * Client runs deletes in the activity panel so the user can navigate away.
 */
export async function DELETE(request: Request) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const spaceId = searchParams.get("space_id");
    const spaceIds = await trashSpaceIds(
      supabase,
      effectiveUserId,
      profile.is_admin,
      spaceId,
    );

    if (spaceIds.length === 0) {
      return NextResponse.json({ items: [], total: 0 });
    }

    const items = await listTrashAssetRefs(supabase, { spaceIds });
    return NextResponse.json({
      items,
      total: items.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not empty trash.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
