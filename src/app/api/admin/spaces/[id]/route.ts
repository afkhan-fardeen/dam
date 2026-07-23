import { NextResponse } from "next/server";
import { requireAdmin, logActivity } from "@/lib/auth";
import { hashPasscode } from "@/lib/passcode";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

const SPACE_COLS =
  "id,name,slug,color,kind,requires_passcode,status,created_by,created_at";

export async function PATCH(request: Request, context: RouteContext) {
  const { ok, user, supabase } = await requireAdmin(request);
  if (!ok || !user) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    color?: string;
    kind?: string;
    status?: string;
    passcode?: string | null;
    clear_passcode?: boolean;
  };

  const { data: existing, error: fetchError } = await supabase
    .from("spaces")
    .select("id,name,slug,status")
    .eq("id", id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim();
  }
  if (typeof body.color === "string" && body.color.trim()) {
    updates.color = body.color.trim();
  }
  if (body.kind === "brand" || body.kind === "department") {
    updates.kind = body.kind;
  }
  if (body.status === "active" || body.status === "archived") {
    updates.status = body.status;
  }
  if (body.clear_passcode) {
    updates.requires_passcode = false;
    updates.passcode_hash = null;
  } else if (typeof body.passcode === "string" && body.passcode.trim()) {
    updates.requires_passcode = true;
    updates.passcode_hash = await hashPasscode(body.passcode.trim());
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("spaces")
    .update(updates)
    .eq("id", id)
    .select(SPACE_COLS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logActivity(
    {
      user_id: user.id,
      space_id: id,
      action: body.status === "archived" ? "archive_space" : "update_space",
      target_type: "space",
      target_id: id,
      details: updates,
    },
    supabase,
  );

  return NextResponse.json({ space: data });
}

/** Permanent delete — only archived spaces; require confirm_name match. */
export async function DELETE(request: Request, context: RouteContext) {
  const { ok, user, supabase } = await requireAdmin(request);
  if (!ok || !user) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await context.params;
  const { searchParams } = new URL(request.url);
  const confirmName = searchParams.get("confirm_name")?.trim() || "";

  const { data: space, error: fetchError } = await supabase
    .from("spaces")
    .select("id,name,status")
    .eq("id", id)
    .single();

  if (fetchError || !space) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }
  if (space.status !== "archived") {
    return NextResponse.json(
      { error: "Archive the space before permanently deleting it." },
      { status: 400 },
    );
  }
  if (confirmName !== space.name) {
    return NextResponse.json(
      { error: "Type the space name exactly to confirm deletion." },
      { status: 400 },
    );
  }

  // Soft-delete assets metadata first is handled by FK — permanently remove space row
  // Cascades memberships/folders; assets have FK to space — need to clear or cascade
  const { error: assetsError } = await supabase
    .from("assets")
    .delete()
    .eq("space_id", id);
  if (assetsError) {
    return NextResponse.json({ error: assetsError.message }, { status: 500 });
  }

  const { error: foldersError } = await supabase
    .from("folders")
    .delete()
    .eq("space_id", id);
  if (foldersError) {
    return NextResponse.json({ error: foldersError.message }, { status: 500 });
  }

  // Detach activity rows so space delete isn't blocked by the FK
  const { error: activityError } = await supabase
    .from("activity_log")
    .update({ space_id: null })
    .eq("space_id", id);
  if (activityError) {
    return NextResponse.json({ error: activityError.message }, { status: 500 });
  }

  const { error } = await supabase.from("spaces").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(
    {
      user_id: user.id,
      action: "delete_space",
      target_type: "space",
      target_id: id,
      details: { name: space.name, permanent: true },
    },
    supabase,
  );

  return NextResponse.json({ ok: true });
}
