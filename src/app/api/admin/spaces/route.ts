import { NextResponse } from "next/server";
import { requireAdmin, logActivity } from "@/lib/auth";
import { hashPasscode } from "@/lib/passcode";

export const runtime = "nodejs";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const SPACE_COLS =
  "id,name,slug,color,kind,requires_passcode,status,created_by,created_at";

export async function GET(request: Request) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get("archived") === "1";

  let query = supabase.from("spaces").select(SPACE_COLS).order("name");
  if (!includeArchived) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ spaces: data ?? [] });
}

export async function POST(request: Request) {
  const { ok, user, supabase } = await requireAdmin(request);
  if (!ok || !user) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as {
    name?: string;
    slug?: string;
    color?: string;
    kind?: string;
    passcode?: string | null;
  };

  const name = body.name?.trim();
  const color = body.color?.trim() || "#0D9488";
  const kind = body.kind === "department" ? "department" : "brand";
  const slug = (body.slug?.trim() || (name ? slugify(name) : "")).toLowerCase();
  const passcode = body.passcode?.trim() || "";

  if (!name || !slug) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const row: Record<string, unknown> = {
    name,
    slug,
    color,
    kind,
    status: "active",
    created_by: user.id,
    requires_passcode: false,
    passcode_hash: null,
  };

  if (passcode) {
    row.requires_passcode = true;
    row.passcode_hash = await hashPasscode(passcode);
  }

  const { data, error } = await supabase
    .from("spaces")
    .insert(row)
    .select(SPACE_COLS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logActivity(
    {
      user_id: user.id,
      space_id: data.id,
      action: "create_space",
      target_type: "space",
      target_id: data.id,
      details: { name, slug, color, kind },
    },
    supabase,
  );

  return NextResponse.json({ space: data }, { status: 201 });
}
