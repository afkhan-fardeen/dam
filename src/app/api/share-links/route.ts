import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { requireUser, roleForSpace } from "@/lib/auth";
import { canEdit } from "@/lib/types";

export const runtime = "nodejs";

function hashPassword(pw: string): string {
  return createHash("sha256").update(pw).digest("hex");
}

export async function GET(request: Request) {
  const { user, profile, supabase } = await requireUser(request);
  if (!user || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const assetId = new URL(request.url).searchParams.get("asset_id");
  if (!assetId) {
    return NextResponse.json({ error: "asset_id required" }, { status: 400 });
  }

  const { data: links, error } = await supabase
    .from("share_links")
    .select(
      "id,token,can_download,expires_at,revoked_at,created_at,password_hash",
    )
    .eq("asset_id", assetId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    links: (links ?? []).map((l) => ({
      ...l,
      has_password: Boolean(l.password_hash),
      password_hash: undefined,
    })),
  });
}

export async function POST(request: Request) {
  const { user, profile, supabase } = await requireUser(request);
  if (!user || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await request.json()) as {
    asset_id?: string;
    can_download?: boolean;
    expires_at?: string | null;
    password?: string | null;
  };
  if (!body.asset_id) {
    return NextResponse.json({ error: "asset_id required" }, { status: 400 });
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("id,space_id")
    .eq("id", body.asset_id)
    .maybeSingle();
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", user.id);
  const role = roleForSpace(
    memberships ?? [],
    asset.space_id as string,
    profile.is_admin,
  );
  if (!canEdit(role, profile.is_admin)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const token = randomBytes(24).toString("base64url");
  const { data: link, error } = await supabase
    .from("share_links")
    .insert({
      asset_id: body.asset_id,
      token,
      created_by: user.id,
      can_download: body.can_download !== false,
      expires_at: body.expires_at || null,
      password_hash: body.password ? hashPassword(body.password) : null,
    })
    .select("id,token,can_download,expires_at,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ link });
}

export async function DELETE(request: Request) {
  const { user, profile, supabase } = await requireUser(request);
  if (!user || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
