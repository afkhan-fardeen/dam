import { NextResponse } from "next/server";
import { requireUser, logActivity, roleForSpace } from "@/lib/auth";
import { canEdit } from "@/lib/types";
import { getFileApiBaseUrl, signFileApiToken } from "@/lib/fileApiAuth";
import { isFolderBlocked } from "@/lib/folderAccess";
import { attachTags, setAssetTags } from "@/lib/search";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ASSET_SELECT =
  "id,file_id,original_name,mime_type,size,space_id,folder_id,description,created_by,uploaded_by,has_thumbnail,status,created_at,tags_text";

export async function PATCH(request: Request, context: RouteContext) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    folder_id?: string | null;
    original_name?: string;
    description?: string | null;
    created_by?: string | null;
    createdBy?: string | null;
    addTags?: string[];
    removeTagIds?: string[];
  };

  const hasFolder = body.folder_id !== undefined;
  const hasRename =
    typeof body.original_name === "string" &&
    body.original_name.trim().length > 0;
  const hasDescription = body.description !== undefined;
  const creditRaw =
    body.created_by !== undefined
      ? body.created_by
      : body.createdBy !== undefined
        ? body.createdBy
        : undefined;
  const hasCredit = creditRaw !== undefined;
  const addTags = Array.isArray(body.addTags)
    ? body.addTags.map(String).map((t) => t.trim()).filter(Boolean)
    : [];
  const removeTagIds = Array.isArray(body.removeTagIds)
    ? body.removeTagIds.map(String).filter(Boolean)
    : [];
  const hasTagAdd = addTags.length > 0;
  const hasTagRemove = removeTagIds.length > 0;

  if (
    !hasFolder &&
    !hasRename &&
    !hasDescription &&
    !hasCredit &&
    !hasTagAdd &&
    !hasTagRemove
  ) {
    return NextResponse.json(
      {
        error:
          "Provide folder_id, original_name, description, created_by, addTags, or removeTagIds",
      },
      { status: 400 },
    );
  }

  const { data: asset, error: fetchError } = await supabase
    .from("assets")
    .select("id,file_id,original_name,space_id,folder_id,status,description,created_by")
    .eq("id", id)
    .single();

  if (fetchError || !asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  if (asset.status === "deleted") {
    return NextResponse.json(
      { error: "Restore the file before editing it" },
      { status: 400 },
    );
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
    return NextResponse.json(
      { error: "You cannot edit files here" },
      { status: 403 },
    );
  }

  const updates: Record<string, unknown> = {};

  if (hasRename) {
    updates.original_name = body.original_name!.trim();
  }

  if (hasDescription) {
    const raw = body.description;
    updates.description =
      raw == null || String(raw).trim() === "" ? null : String(raw).trim();
  }

  if (hasCredit) {
    const raw = creditRaw;
    updates.created_by =
      raw == null || String(raw).trim() === "" ? null : String(raw).trim();
  }

  if (hasFolder) {
    const nextFolderId = body.folder_id;
    if (nextFolderId) {
      const { data: dest } = await supabase
        .from("folders")
        .select("id,space_id")
        .eq("id", nextFolderId)
        .single();

      if (!dest || dest.space_id !== asset.space_id) {
        return NextResponse.json(
          { error: "Destination folder not found in this space" },
          { status: 400 },
        );
      }

      const access = await isFolderBlocked(
        supabase,
        effectiveUserId,
        nextFolderId,
      );
      if (access.blocked) {
        return NextResponse.json(
          {
            error: "Destination folder is locked",
            code: "FOLDER_LOCKED",
            folder_id: access.lockedFolderId,
          },
          { status: 403 },
        );
      }
    }
    updates.folder_id = nextFolderId;
  }

  let data = null as Record<string, unknown> | null;

  if (Object.keys(updates).length > 0) {
    const { data: updated, error } = await supabase
      .from("assets")
      .update(updates)
      .eq("id", id)
      .select(ASSET_SELECT)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    data = updated;
  } else {
    const { data: current, error } = await supabase
      .from("assets")
      .select(ASSET_SELECT)
      .eq("id", id)
      .single();
    if (error || !current) {
      return NextResponse.json(
        { error: error?.message || "Asset not found" },
        { status: 500 },
      );
    }
    data = current;
  }

  if (hasTagRemove) {
    const { error: remError } = await supabase
      .from("asset_tags")
      .delete()
      .eq("asset_id", id)
      .in("tag_id", removeTagIds);
    if (remError) {
      return NextResponse.json({ error: remError.message }, { status: 500 });
    }
  }

  if (hasTagAdd) {
    try {
      await setAssetTags(getSupabaseAdmin(), id, addTags, false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not add tags";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Re-fetch after tag changes so tags_text is current
  if (hasTagAdd || hasTagRemove) {
    const { data: refreshed, error: refreshError } = await supabase
      .from("assets")
      .select(ASSET_SELECT)
      .eq("id", id)
      .single();
    if (refreshError || !refreshed) {
      return NextResponse.json(
        { error: refreshError?.message || "Could not reload asset" },
        { status: 500 },
      );
    }
    data = refreshed;
  }

  const [withTags] = await attachTags(supabase, [data as never]);

  if (hasRename) {
    await logActivity(
      {
        user_id: user.id,
        space_id: asset.space_id,
        action: "rename_asset",
        target_type: "asset",
        target_id: id,
        details: {
          from: asset.original_name,
          to: updates.original_name,
        },
      },
      supabase,
    );
  }

  if (hasFolder) {
    await logActivity(
      {
        user_id: user.id,
        space_id: asset.space_id,
        action: "move_asset",
        target_type: "asset",
        target_id: id,
        details: {
          original_name: asset.original_name,
          from_folder_id: asset.folder_id,
          to_folder_id: body.folder_id,
        },
      },
      supabase,
    );
  }

  if (hasDescription || hasCredit || hasTagAdd || hasTagRemove) {
    await logActivity(
      {
        user_id: user.id,
        space_id: asset.space_id,
        action: "update_asset",
        target_type: "asset",
        target_id: id,
        details: {
          original_name: asset.original_name,
          description: hasDescription,
          created_by: hasCredit,
          addTags: hasTagAdd ? addTags : undefined,
          removeTagIds: hasTagRemove ? removeTagIds : undefined,
        },
      },
      supabase,
    );
  }

  return NextResponse.json({ asset: withTags });
}

/** Soft delete — DB only so Trash restore works. */
export async function DELETE(request: Request, context: RouteContext) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await context.params;
  const permanent =
    new URL(request.url).searchParams.get("permanent") === "1";

  const { data: asset, error: fetchError } = await supabase
    .from("assets")
    .select("id,file_id,status,space_id,original_name")
    .eq("id", id)
    .single();

  if (fetchError || !asset) {
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
    return NextResponse.json(
      { error: "You cannot remove files here" },
      { status: 403 },
    );
  }

  if (permanent) {
    const path = `/asset/${asset.file_id}`;
    const { token } = signFileApiToken("DELETE", path);
    const fileRes = await fetch(`${getFileApiBaseUrl()}${path}`, {
      method: "DELETE",
      headers: { "x-auth-token": token },
    });
    if (!fileRes.ok && fileRes.status !== 404) {
      const detail = await fileRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: "Could not remove the file from storage",
          detail: detail.slice(0, 200),
        },
        { status: 502 },
      );
    }

    const { error: delError } = await supabase
      .from("assets")
      .delete()
      .eq("id", id);
    if (delError) {
      return NextResponse.json({ error: delError.message }, { status: 500 });
    }

    await logActivity(
      {
        user_id: user.id,
        space_id: asset.space_id,
        action: "delete",
        target_type: "asset",
        target_id: id,
        details: { permanent: true, original_name: asset.original_name },
      },
      supabase,
    );

    return NextResponse.json({ ok: true, permanent: true });
  }

  if (asset.status === "deleted") {
    return NextResponse.json({ ok: true, alreadyDeleted: true });
  }

  const { error: updateError } = await supabase
    .from("assets")
    .update({ status: "deleted" })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await logActivity(
    {
      user_id: user.id,
      space_id: asset.space_id,
      action: "delete",
      target_type: "asset",
      target_id: id,
      details: { original_name: asset.original_name },
    },
    supabase,
  );

  return NextResponse.json({ ok: true });
}
