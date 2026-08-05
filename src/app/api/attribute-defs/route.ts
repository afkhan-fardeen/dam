import { NextResponse } from "next/server";
import { requireUser, requireAdmin, logActivity } from "@/lib/auth";
import { getAttributeDefs } from "@/lib/attributes";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { user, supabase } = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const spaceKind = new URL(request.url).searchParams.get("space_kind");
  try {
    const defs = await getAttributeDefs(supabase, {
      spaceKind,
      includeArchived: false,
    });
    return NextResponse.json({ defs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { ok, user, supabase } = await requireAdmin(request);
  if (!ok || !user) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    label?: string;
    data_type?: string;
    dropdown_options?: string[] | null;
    applicable_space_kind?: string | null;
  };

  const name = body.name?.trim().toLowerCase().replace(/\s+/g, "_");
  const label = body.label?.trim();
  const dataType = body.data_type;
  if (!name || !label || !dataType) {
    return NextResponse.json(
      { error: "name, label, and data_type are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("attribute_defs")
    .insert({
      name,
      label,
      data_type: dataType,
      dropdown_options: body.dropdown_options ?? null,
      applicable_space_kind: body.applicable_space_kind ?? null,
    })
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
      action: "create_attribute_def",
      target_type: "attribute_def",
      target_id: data.id,
      details: { name, label, data_type: dataType },
    },
    supabase,
  );

  return NextResponse.json({ def: data }, { status: 201 });
}
