import { NextResponse } from "next/server";
import { requireUser, requireAdmin, logActivity } from "@/lib/auth";
import { getEntity, getRelatedDocuments } from "@/lib/entities";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const { user, supabase } = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { id } = await context.params;
  try {
    let entity = await getEntity(supabase, id);
    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 });
    }

    // Follow merge chain once
    if (entity.status === "merged" && entity.merged_into_id) {
      const target = await getEntity(supabase, entity.merged_into_id);
      if (target) entity = target;
    }

    const documents = await getRelatedDocuments(supabase, entity.id);
    return NextResponse.json({ entity, documents });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: Ctx) {
  const { ok, user, supabase } = await requireAdmin(request);
  if (!ok || !user) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    name?: string;
    aliases?: string[];
    description?: string | null;
    type_id?: string;
    roles?: string[];
    status?: "active" | "archived";
  };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.name?.trim()) updates.name = body.name.trim();
  if (body.aliases !== undefined) updates.aliases = body.aliases;
  if (body.description !== undefined) updates.description = body.description;
  if (body.type_id) updates.type_id = body.type_id;
  if (body.roles !== undefined) updates.roles = body.roles;
  if (body.status === "active" || body.status === "archived") {
    updates.status = body.status;
  }

  const { data, error } = await supabase
    .from("entities")
    .update(updates)
    .eq("id", id)
    .select(
      "id,type_id,name,aliases,description,status,merged_into_id,roles,created_by,created_at,updated_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logActivity(
    {
      user_id: user.id,
      action: body.status === "archived" ? "archive_entity" : "rename_entity",
      target_type: "entity",
      target_id: id,
      details: updates,
    },
    supabase,
  );

  return NextResponse.json({ entity: data });
}
