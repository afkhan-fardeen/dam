import { NextResponse } from "next/server";
import { requireUser, logActivity, roleForSpace } from "@/lib/auth";
import { canEdit } from "@/lib/types";
import type { AssetInsert } from "@/lib/types";
import { setAssetTags, attachTags } from "@/lib/search";
import { resolveEffectiveFolderMeta } from "@/lib/folderInheritance";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user, profile, supabase } = await requireUser(request);
  if (!user || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await request.json()) as Partial<AssetInsert>;

  if (!body.file_id || !body.original_name || !body.mime_type || !body.space_id) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", user.id);

  const role = roleForSpace(memberships ?? [], body.space_id, profile.is_admin);
  if (!canEdit(role, profile.is_admin)) {
    return NextResponse.json({ error: "You cannot upload to this space" }, { status: 403 });
  }

  const folderId = body.folder_id ? String(body.folder_id) : null;
  const { data: space } = await supabase
    .from("spaces")
    .select("kind,name")
    .eq("id", body.space_id)
    .maybeSingle();

  let inheritedBrand: string | null = null;
  let inheritedTags: string[] = [];
  try {
    const effective = await resolveEffectiveFolderMeta(
      supabase,
      String(body.space_id),
      folderId,
      space?.kind,
      space?.name,
    );
    inheritedBrand = effective.brand;
    inheritedTags = effective.tagNames;
  } catch {
    /* folder_tags may be missing pre-migration */
  }

  const brand =
    body.brand != null && String(body.brand).trim()
      ? String(body.brand).trim()
      : inheritedBrand;

  const row = {
    file_id: String(body.file_id),
    original_name: String(body.original_name),
    mime_type: String(body.mime_type),
    size: Number(body.size ?? 0),
    space_id: String(body.space_id),
    folder_id: folderId,
    description: body.description != null ? String(body.description) : null,
    brand,
    created_by: body.created_by != null ? String(body.created_by) : null,
    uploaded_by: user.id,
    has_thumbnail: Boolean(body.has_thumbnail),
    status: "active",
  };

  const { data, error } = await supabase
    .from("assets")
    .insert(row)
    .select(
      "id,file_id,original_name,mime_type,size,space_id,folder_id,description,brand,created_by,uploaded_by,has_thumbnail,status,created_at,tags_text",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const explicitTags = Array.isArray(body.tags)
    ? body.tags
        .map(String)
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  const tagNames = [...explicitTags];
  const seen = new Set(explicitTags.map((t) => t.toLowerCase()));
  for (const t of inheritedTags) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tagNames.push(t);
  }
  if (tagNames.length > 0) {
    try {
      // Service role after permission check — avoids RLS edge cases on tag writes.
      await setAssetTags(getSupabaseAdmin(), data.id, tagNames, true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save tags";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const [asset] = await attachTags(supabase, [data]);

  await logActivity(
    {
      user_id: user.id,
      space_id: row.space_id,
      action: "upload",
      target_type: "asset",
      target_id: data.id,
      details: {
        original_name: row.original_name,
        folder_id: row.folder_id,
        tags: tagNames,
      },
    },
    supabase,
  );

  return NextResponse.json({ asset }, { status: 201 });
}
