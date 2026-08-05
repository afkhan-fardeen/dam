import { NextResponse } from "next/server";
import { requireUser, requireAdmin, logActivity } from "@/lib/auth";
import { listEntityTypes } from "@/lib/entities";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { user, supabase } = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const types = await listEntityTypes(supabase);
    return NextResponse.json({ types });
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

  const body = (await request.json()) as { name?: string; label?: string };
  const name = body.name?.trim().toLowerCase().replace(/\s+/g, "_");
  const label = body.label?.trim();
  if (!name || !label) {
    return NextResponse.json(
      { error: "name and label are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("entity_types")
    .insert({ name, label, is_system: false })
    .select("id,name,label,is_system,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logActivity(
    {
      user_id: user.id,
      action: "create_entity_type",
      target_type: "entity_type",
      target_id: data.id,
      details: { name, label },
    },
    supabase,
  );

  return NextResponse.json({ type: data }, { status: 201 });
}
