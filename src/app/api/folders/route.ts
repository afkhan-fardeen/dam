import { NextResponse } from "next/server";
import { requireUser, logActivity, roleForSpace } from "@/lib/auth";
import { canEdit } from "@/lib/types";
import { hashPasscode } from "@/lib/passcode";

export const runtime = "nodejs";

const FOLDER_PUBLIC_COLS =
  "id,space_id,parent_folder_id,name,passcode_enabled,created_by,created_at";

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ folders: data ?? [] });
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

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("folders")
    .update(updates)
    .eq("id", body.id)
    .select(FOLDER_PUBLIC_COLS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const action =
    body.passcode !== undefined || body.passcode_enabled !== undefined
      ? "folder_passcode"
      : body.parent_folder_id !== undefined
        ? "move_folder"
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
      },
    },
    supabase,
  );

  return NextResponse.json({ folder: data });
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
