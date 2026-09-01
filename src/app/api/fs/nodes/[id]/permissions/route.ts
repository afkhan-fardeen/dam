import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rpcCanEditNode } from "@/lib/fsNodes";
import type { PermissionLevel } from "@/lib/types";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await context.params;

  const { data, error } = await supabase
    .from("folder_permissions")
    .select(
      "id,fs_node_id,principal_type,principal_id,level,passcode_required,created_at",
    )
    .eq("fs_node_id", id)
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ permissions: data ?? [] });
}

export async function POST(request: Request, context: RouteContext) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await context.params;
  const canEdit =
    profile.is_admin || (await rpcCanEditNode(supabase, id).catch(() => false));
  if (!canEdit) {
    return NextResponse.json({ error: "Editors only" }, { status: 403 });
  }

  const body = (await request.json()) as {
    principal_type?: "user" | "group" | "everyone";
    principal_id?: string | null;
    level?: PermissionLevel;
    passcode_required?: boolean;
  };

  if (!body.principal_type || !body.level) {
    return NextResponse.json(
      { error: "principal_type and level required" },
      { status: 400 },
    );
  }
  if (body.principal_type !== "everyone" && !body.principal_id) {
    return NextResponse.json(
      { error: "principal_id required" },
      { status: 400 },
    );
  }

  const { data: node } = await supabase
    .from("fs_nodes")
    .select("id,node_type")
    .eq("id", id)
    .maybeSingle();
  if (!node || node.node_type !== "folder") {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("folder_permissions")
    .upsert(
      {
        fs_node_id: id,
        principal_type: body.principal_type,
        principal_id:
          body.principal_type === "everyone" ? null : body.principal_id,
        level: body.level,
        passcode_required: Boolean(body.passcode_required),
      },
      { onConflict: "fs_node_id,principal_type,principal_id" },
    )
    .select(
      "id,fs_node_id,principal_type,principal_id,level,passcode_required,created_at",
    )
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ permission: data }, { status: 201 });
}

export async function DELETE(request: Request, context: RouteContext) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const { id } = await context.params;
  const canEdit =
    profile.is_admin || (await rpcCanEditNode(supabase, id).catch(() => false));
  if (!canEdit) {
    return NextResponse.json({ error: "Editors only" }, { status: 403 });
  }

  const permissionId = new URL(request.url).searchParams.get("permission_id");
  if (!permissionId) {
    return NextResponse.json(
      { error: "permission_id required" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("folder_permissions")
    .delete()
    .eq("id", permissionId)
    .eq("fs_node_id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
