import { NextResponse } from "next/server";
import { requireUser, roleForSpace } from "@/lib/auth";
import { canEdit } from "@/lib/types";
import { isFolderBlocked } from "@/lib/folderAccess";
import { isSpaceBlocked } from "@/lib/spaceAccess";
import {
  attachFavorites,
  attachTags,
  filterUnlockedAssets,
  listFolderAssets,
  listRecentAssets,
  listTrashAssets,
  searchAssets,
} from "@/lib/search";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") ?? "";
    const spaceId = searchParams.get("space_id");
    const folderId = searchParams.get("folder_id");
    const tag = searchParams.get("tag");
    const view = searchParams.get("view") ?? "all";
    const starred = searchParams.get("starred") === "1" || view === "starred";

    const { data: memberships } = await supabase
      .from("space_memberships")
      .select("id,space_id,user_id,role,created_at")
      .eq("user_id", effectiveUserId);

    const memberSpaceIds = [
      ...new Set((memberships ?? []).map((m) => m.space_id as string)),
    ];

    const allSpaceIds = profile.is_admin
      ? (
          await supabase.from("spaces").select("id").eq("status", "active")
        ).data?.map((b) => b.id as string) ?? memberSpaceIds
      : memberSpaceIds;

    async function withMeta(assets: Awaited<ReturnType<typeof listRecentAssets>>) {
      const unlocked = await filterUnlockedAssets(
        supabase,
        effectiveUserId!,
        assets,
      );
      return attachFavorites(supabase, effectiveUserId!, unlocked);
    }

    if (starred && !spaceId) {
      const { data: favs } = await supabase
        .from("asset_favorites")
        .select("asset_id,created_at")
        .eq("user_id", effectiveUserId)
        .order("created_at", { ascending: false });
      const ids = (favs ?? []).map((f) => f.asset_id as string);
      if (ids.length === 0) {
        return NextResponse.json({
          assets: [],
          count: 0,
          view: "starred",
          global: true,
        });
      }
      const { data } = await supabase
        .from("assets")
        .select(
          "id,file_id,original_name,mime_type,size,space_id,folder_id,description,created_by,uploaded_by,has_thumbnail,status,created_at,tags_text",
        )
        .in("id", ids)
        .eq("status", "active");
      const order = new Map(ids.map((id, i) => [id, i]));
      const sorted = ((data ?? []) as { id: string }[]).sort(
        (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
      );
      const tagged = await attachTags(supabase, sorted as never);
      const assets = await withMeta(tagged);
      return NextResponse.json({
        assets: assets.map((a) => ({ ...a, favorited: true })),
        count: assets.length,
        view: "starred",
        global: true,
      });
    }

    // Cross-space when space_id omitted (All files / Recent / Trash / global search)
    if (!spaceId) {
      if (q.trim()) {
        const assets = await searchAssets(supabase, {
          q,
          spaceIds: allSpaceIds,
          tag,
          userId: effectiveUserId,
        });
        const favorited = await attachFavorites(
          supabase,
          effectiveUserId,
          assets,
        );
        return NextResponse.json({
          assets: favorited,
          count: favorited.length,
          view: "search",
          global: true,
        });
      }

      if (view === "trash") {
        if (!profile.is_admin) {
          const editorIds = (memberships ?? [])
            .filter((m) => m.role === "editor")
            .map((m) => m.space_id as string);
          if (editorIds.length === 0) {
            return NextResponse.json({
              assets: [],
              count: 0,
              view,
              global: true,
            });
          }
          const chunks = await Promise.all(
            editorIds.map((id) => listTrashAssets(supabase, { spaceId: id })),
          );
          const assets = chunks
            .flat()
            .sort((a, b) =>
              (b.created_at || "").localeCompare(a.created_at || ""),
            );
          const favorited = await attachFavorites(
            supabase,
            effectiveUserId,
            assets,
          );
          return NextResponse.json({
            assets: favorited,
            count: favorited.length,
            view,
            global: true,
          });
        }
        const chunks = await Promise.all(
          allSpaceIds.map((id) => listTrashAssets(supabase, { spaceId: id })),
        );
        const assets = chunks
          .flat()
          .sort((a, b) =>
            (b.created_at || "").localeCompare(a.created_at || ""),
          );
        const favorited = await attachFavorites(
          supabase,
          effectiveUserId,
          assets,
        );
        return NextResponse.json({
          assets: favorited,
          count: favorited.length,
          view,
          global: true,
        });
      }

      const assets = await listRecentAssets(supabase, {
        spaceIds: allSpaceIds,
        tag,
        limit: view === "recent" ? 48 : 24,
      });
      const withFav = await withMeta(assets);
      return NextResponse.json({
        assets: withFav,
        count: withFav.length,
        view: view === "recent" ? "recent" : "all",
        global: true,
      });
    }

    const role = roleForSpace(memberships ?? [], spaceId, profile.is_admin);
    if (!role && !profile.is_admin) {
      return NextResponse.json({ error: "No access to this space" }, { status: 403 });
    }

    const spaceLock = await isSpaceBlocked(supabase, effectiveUserId, spaceId);
    if (spaceLock.blocked && !profile.is_admin) {
      return NextResponse.json(
        {
          error: "This space is locked",
          code: "SPACE_LOCKED",
          space_id: spaceId,
        },
        { status: 403 },
      );
    }

    if (view === "trash") {
      if (!canEdit(role, profile.is_admin)) {
        return NextResponse.json(
          { error: "Trash is for editors only" },
          { status: 403 },
        );
      }
      const assets = await listTrashAssets(supabase, { spaceId });
      const favorited = await attachFavorites(supabase, effectiveUserId, assets);
      return NextResponse.json({
        assets: favorited,
        count: favorited.length,
        view,
      });
    }

    if (q.trim()) {
      const assets = await searchAssets(supabase, {
        q,
        spaceId,
        tag,
        userId: effectiveUserId,
      });
      const favorited = await attachFavorites(supabase, effectiveUserId, assets);
      return NextResponse.json({
        assets: favorited,
        count: favorited.length,
        view: "search",
      });
    }

    if (view === "recent") {
      const assets = await listRecentAssets(supabase, { spaceId, tag });
      const withFav = await withMeta(assets);
      return NextResponse.json({
        assets: withFav,
        count: withFav.length,
        view,
      });
    }

    if (starred) {
      const { data: favs } = await supabase
        .from("asset_favorites")
        .select("asset_id")
        .eq("user_id", effectiveUserId);
      const ids = (favs ?? []).map((f) => f.asset_id as string);
      if (ids.length === 0) {
        return NextResponse.json({ assets: [], count: 0, view: "starred" });
      }
      const assets = await listRecentAssets(supabase, {
        spaceId,
        tag,
        limit: 200,
      });
      const filtered = assets.filter((a) => ids.includes(a.id));
      const withFav = await withMeta(filtered);
      return NextResponse.json({
        assets: withFav.map((a) => ({ ...a, favorited: true })),
        count: withFav.length,
        view: "starred",
      });
    }

    if (folderId) {
      const access = await isFolderBlocked(supabase, effectiveUserId, folderId);
      if (access.blocked) {
        return NextResponse.json(
          {
            error: "This folder is locked",
            code: "FOLDER_LOCKED",
            folder_id: access.lockedFolderId,
          },
          { status: 403 },
        );
      }
    }

    const assets = await listFolderAssets(supabase, {
      spaceId,
      folderId: folderId || null,
      tag,
    });
    const favorited = await attachFavorites(supabase, effectiveUserId, assets);

    return NextResponse.json({
      assets: favorited,
      count: favorited.length,
      view: "all",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
