import { NextResponse } from "next/server";
import { requireUser, logActivity, roleForSpace } from "@/lib/auth";
import { canEdit } from "@/lib/types";
import { hashPasscode } from "@/lib/passcode";
import {
  recomputeSubtreeInheritance,
  setFolderTags,
} from "@/lib/folderInheritance";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const FOLDER_PUBLIC_COLS =
  "id,space_id,parent_folder_id,name,passcode_enabled,description,notes,brand,created_by,created_at";

async function attachFolderTags(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  folders: { id: string }[],
) {
  if (folders.length === 0) return folders;
  const ids = folders.map((f) => f.id);
  const { data: links } = await supabase
    .from("folder_tags")
    .select("folder_id,tag_id")
    .in("folder_id", ids);
  if (!links?.length) {
    return folders.map((f) => ({ ...f, tags: [] as { id: string; name: string }[] }));
  }
  const tagIds = [...new Set(links.map((l) => l.tag_id as string))];
  const { data: tags } = await supabase
    .from("tags")
    .select("id,name")
    .in("id", tagIds);
  const byId = new Map(
    (tags ?? []).map((t) => [t.id as string, { id: t.id as string, name: t.name as string }]),
  );
  const map = new Map<string, { id: string; name: string }[]>();
  for (const link of links) {
    const tag = byId.get(link.tag_id as string);
    if (!tag) continue;
    const list = map.get(link.folder_id as string) ?? [];
    list.push(tag);
    map.set(link.folder_id as string, list);
  }
  return folders.map((f) => ({ ...f, tags: map.get(f.id) ?? [] }));
}

export async function GET(request: Request) {
  const { user, supabase } = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const spaceId = new URL(request.url).searchParams.get("space_id");
  if (!spaceId) {
    return NextResponse.json({ error: "space_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("folders")
    .select(FOLDER_PUBLIC_COLS)
    .eq("space_id", spaceId)
    .order("name");

  if (error) {
    // Pre-014 fallback without metadata columns
    const { data: fallback, error: err2 } = await supabase
      .from("folders")
      .select(
        "id,space_id,parent_folder_id,name,passcode_enabled,created_by,created_at",
      )
      .eq("space_id", spaceId)
      .order("name");
    if (err2) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      folders: (fallback ?? []).map((f) => ({ ...f, tags: [] })),
    });
  }

  try {
    const withTags = await attachFolderTags(supabase, data ?? []);
    return NextResponse.json({ folders: withTags });
  } catch {
    return NextResponse.json({
      folders: (data ?? []).map((f) => ({ ...f, tags: [] })),
    });
  }
}

export async function POST(request: Request) {
  const { user, profile, supabase } = await requireUser(request);
  if (!user || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await request.json()) as {
    space_id?: string;
    parent_folder_id?: string | null;
    name?: string;
  };

  const name = body.name?.trim();
  if (!body.space_id || !name) {
    return NextResponse.json({ error: "Space and name are required" }, { status: 400 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", user.id);

  const role = roleForSpace(memberships ?? [], body.space_id, profile.is_admin);
  if (!canEdit(role, profile.is_admin)) {
    return NextResponse.json({ error: "You cannot create folders here" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("folders")
    .insert({
      space_id: body.space_id,
      parent_folder_id: body.parent_folder_id || null,
      name,
      created_by: user.id,
    })
    .select(FOLDER_PUBLIC_COLS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logActivity(
    {
      user_id: user.id,
      space_id: body.space_id,
      action: "create_folder",
      target_type: "folder",
      target_id: data.id,
      details: { name, parent_folder_id: body.parent_folder_id || null },
    },
    supabase,
  );

  return NextResponse.json({ folder: data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const { user, profile, supabase } = await requireUser(request);
  if (!user || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await request.json()) as {
    id?: string;
    name?: string;
    parent_folder_id?: string | null;
    passcode?: string | null;
    passcode_enabled?: boolean;
    description?: string | null;
    notes?: string | null;
    brand?: string | null;
    tags?: string[];
  };

  if (!body.id) {
    return NextResponse.json({ error: "Missing folder id" }, { status: 400 });
  }

  const { data: folder } = await supabase
    .from("folders")
    .select("id,space_id,name,passcode_enabled,passcode_hash")
    .eq("id", body.id)
    .single();

  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", user.id);

  const role = roleForSpace(memberships ?? [], folder.space_id, profile.is_admin);
  if (!canEdit(role, profile.is_admin)) {
    return NextResponse.json({ error: "You cannot change folders here" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (body.name?.trim()) updates.name = body.name.trim();
  if (body.description !== undefined) {
    updates.description = body.description?.trim() || null;
  }
  if (body.notes !== undefined) {
    updates.notes = body.notes?.trim() || null;
  }
  if (body.brand !== undefined) {
    updates.brand = body.brand?.trim() || null;
  }
  if (body.parent_folder_id !== undefined) {
    if (body.parent_folder_id === body.id) {
      return NextResponse.json(
        { error: "A folder cannot be its own parent" },
        { status: 400 },
      );
    }
    updates.parent_folder_id = body.parent_folder_id;
  }

  if (body.passcode !== undefined) {
    const raw = body.passcode?.trim() ?? "";
    if (raw === "") {
      updates.passcode_hash = null;
      updates.passcode_enabled = false;
    } else {
      if (raw.length < 4) {
        return NextResponse.json(
          { error: "Passcode must be at least 4 characters" },
          { status: 400 },
        );
      }
      updates.passcode_hash = await hashPasscode(raw);
      updates.passcode_enabled = true;
    }
  }

  if (body.passcode_enabled !== undefined && body.passcode === undefined) {
    if (body.passcode_enabled && !folder.passcode_hash) {
      return NextResponse.json(
        { error: "Set a passcode before enabling the lock" },
        { status: 400 },
      );
    }
    updates.passcode_enabled = body.passcode_enabled;
    if (!body.passcode_enabled) {
      // Turning off keeps hash so it can be re-enabled; plan says clear nulls hash
      // Plan: "clearing passcode nulls hash and sets enabled false"
      // "Turn passcode off" = disable. I'll null hash when turning off for simplicity matching "Turn passcode off"
      updates.passcode_hash = null;
    }
  }

  const metaOnly =
    Array.isArray(body.tags) ||
    body.description !== undefined ||
    body.notes !== undefined ||
    body.brand !== undefined;

  if (Object.keys(updates).length === 0 && !Array.isArray(body.tags)) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  let data = folder as Record<string, unknown>;
  if (Object.keys(updates).length > 0) {
    const { data: updated, error } = await supabase
      .from("folders")
      .update(updates)
      .eq("id", body.id)
      .select(FOLDER_PUBLIC_COLS)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    data = updated;
  } else {
    const { data: current } = await supabase
      .from("folders")
      .select(FOLDER_PUBLIC_COLS)
      .eq("id", body.id)
      .single();
    if (current) data = current;
  }

  if (Array.isArray(body.tags)) {
    try {
      await setFolderTags(getSupabaseAdmin(), body.id, body.tags.map(String));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not save folder tags";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (metaOnly || body.brand !== undefined || Array.isArray(body.tags)) {
    const { data: space } = await supabase
      .from("spaces")
      .select("kind,name")
      .eq("id", folder.space_id)
      .maybeSingle();
    try {
      await recomputeSubtreeInheritance(
        getSupabaseAdmin(),
        folder.space_id,
        body.id,
        space?.kind,
        space?.name,
      );
    } catch {
      /* inheritance best-effort */
    }
  }

  const action =
    body.passcode !== undefined || body.passcode_enabled !== undefined
      ? "folder_passcode"
      : body.parent_folder_id !== undefined
        ? "move_folder"
        : metaOnly
          ? "folder_metadata"
          : "rename_folder";

  await logActivity(
    {
      user_id: user.id,
      space_id: folder.space_id,
      action,
      target_type: "folder",
      target_id: body.id,
      details: {
        name: data.name,
        previous_name: folder.name,
        passcode_enabled: data.passcode_enabled,
        parent_folder_id: data.parent_folder_id,
        brand: data.brand,
      },
    },
    supabase,
  );

  const [withTags] = await attachFolderTags(supabase, [
    data as { id: string },
  ]);
  return NextResponse.json({ folder: withTags });
}

export async function DELETE(request: Request) {
  const { user, profile, supabase } = await requireUser(request);
  if (!user || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing folder id" }, { status: 400 });
  }

  const { data: folder } = await supabase
    .from("folders")
    .select("id,space_id,name")
    .eq("id", id)
    .single();

  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", user.id);

  const role = roleForSpace(memberships ?? [], folder.space_id, profile.is_admin);
  if (!canEdit(role, profile.is_admin)) {
    return NextResponse.json({ error: "You cannot remove folders here" }, { status: 403 });
  }

  const { count: childCount } = await supabase
    .from("folders")
    .select("id", { count: "exact", head: true })
    .eq("parent_folder_id", id);

  if ((childCount ?? 0) > 0) {
    return NextResponse.json(
      { error: "Folder is not empty. Remove subfolders first." },
      { status: 400 },
    );
  }

  const { count: assetCount } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("folder_id", id)
    .neq("status", "deleted");

  // Also block if any assets (including deleted) still reference? Plan: refuse if non-empty.
  // Count active assets; also check any assets in folder
  const { count: anyAssets } = await supabase
    .from("assets")
    .select("id", { count: "exact", head: true })
    .eq("folder_id", id);

  if ((assetCount ?? 0) > 0 || (anyAssets ?? 0) > 0) {
    return NextResponse.json(
      { error: "Folder is not empty. Move or delete files first." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logActivity(
    {
      user_id: user.id,
      space_id: folder.space_id,
      action: "delete_folder",
      target_type: "folder",
      target_id: id,
      details: { name: folder.name },
    },
    supabase,
  );

  return NextResponse.json({ ok: true });
}
