import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdmin, VIEW_AS_COOKIE } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as { user_id?: string | null };
  const jar = await cookies();

  if (!body.user_id) {
    jar.delete(VIEW_AS_COOKIE);
    return NextResponse.json({ ok: true, cleared: true });
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("id,is_admin,is_active")
    .eq("id", body.user_id)
    .single();

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (target.is_admin) {
    return NextResponse.json(
      { error: "Cannot view as another admin" },
      { status: 400 },
    );
  }

  jar.set(VIEW_AS_COOKIE, body.user_id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const { ok } = await requireAdmin();
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const jar = await cookies();
  jar.delete(VIEW_AS_COOKIE);
  return NextResponse.json({ ok: true });
}
