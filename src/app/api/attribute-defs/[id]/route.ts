import { NextResponse } from "next/server";
import { requireAdmin, logActivity } from "@/lib/auth";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const { ok, user, supabase } = await requireAdmin(request);
  if (!ok || !user) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as {
    label?: string;
    dropdown_options?: string[] | null;
    applicable_space_kind?: string | null;
    searchable?: boolean;
    filterable?: boolean;
    status?: "active" | "archived";
  };

  const updates: Record<string, unknown> = {};
  if (body.label?.trim()) updates.label = body.label.trim();
  if (body.dropdown_options !== undefined) {
    updates.dropdown_options = body.dropdown_options;
  }
  if (body.applicable_space_kind !== undefined) {
    updates.applicable_space_kind = body.applicable_space_kind;
  }
  if (typeof body.searchable === "boolean") updates.searchable = body.searchable;
  if (typeof body.filterable === "boolean") updates.filterable = body.filterable;
  if (body.status === "active" || body.status === "archived") {
    updates.status = body.status;
  }

  const { data, error } = await supabase
    .from("attribute_defs")
    .update(updates)
    .eq("id", id)
    .select(
      "id,name,label,data_type,dropdown_options,applicable_space_kind,searchable,filterable,status,created_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logActivity(
    {
      user_id: user.id,
      action: "update_attribute_def",
      target_type: "attribute_def",
      target_id: id,
      details: updates,
    },
    supabase,
  );

  return NextResponse.json({ def: data });
}
