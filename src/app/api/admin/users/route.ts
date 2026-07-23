import { NextResponse } from "next/server";
import { requireAdmin, logActivity } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { SpaceRole } from "@/lib/types";

export const runtime = "nodejs";

type MembershipInput = {
  space_id: string;
  role: SpaceRole;
};

type InviteBody = {
  email?: string;
  full_name?: string;
  password?: string;
  memberships?: MembershipInput[];
};

export async function GET(request: Request) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id,full_name,email,is_admin,is_active,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at");

  return NextResponse.json({
    users: profiles ?? [],
    memberships: memberships ?? [],
  });
}

export async function POST(request: Request) {
  const { ok, user, supabase } = await requireAdmin(request);
  if (!ok || !user) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as InviteBody;
  const email = body.email?.trim().toLowerCase();
  const fullName = body.full_name?.trim() || "";
  const password = body.password?.trim() || "";
  const memberships = body.memberships ?? [];

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdmin();
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message || "Could not create user" },
      { status: 400 },
    );
  }

  const newUserId = created.user.id;

  await admin.from("profiles").upsert({
    id: newUserId,
    email,
    full_name: fullName,
    is_admin: false,
  });

  for (const m of memberships) {
    if (!m.space_id || !["viewer", "downloader", "editor"].includes(m.role)) {
      continue;
    }
    await supabase.from("space_memberships").upsert(
      {
        space_id: m.space_id,
        user_id: newUserId,
        role: m.role,
      },
      { onConflict: "space_id,user_id" },
    );
  }

  await logActivity(
    {
      user_id: user.id,
      action: "create_user",
      target_type: "user",
      target_id: newUserId,
      details: { email, memberships },
    },
    supabase,
  );

  return NextResponse.json(
    { ok: true, user_id: newUserId, email, password },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const { ok, user, supabase } = await requireAdmin(request);
  if (!ok || !user) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json()) as {
    user_id?: string;
    memberships?: MembershipInput[];
    is_admin?: boolean;
    is_active?: boolean;
    password?: string;
    remove_space_ids?: string[];
  };

  if (!body.user_id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  if (typeof body.password === "string") {
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }
    const admin = getSupabaseAdmin();
    const { error: pwError } = await admin.auth.admin.updateUserById(
      body.user_id,
      { password: body.password },
    );
    if (pwError) {
      return NextResponse.json({ error: pwError.message }, { status: 400 });
    }
    await logActivity(
      {
        user_id: user.id,
        action: "reset_password",
        target_type: "user",
        target_id: body.user_id,
      },
      supabase,
    );
  }

  if (typeof body.is_admin === "boolean") {
    await supabase
      .from("profiles")
      .update({ is_admin: body.is_admin })
      .eq("id", body.user_id);
  }

  if (typeof body.is_active === "boolean") {
    await supabase
      .from("profiles")
      .update({ is_active: body.is_active })
      .eq("id", body.user_id);
  }

  if (body.remove_space_ids?.length) {
    await supabase
      .from("space_memberships")
      .delete()
      .eq("user_id", body.user_id)
      .in("space_id", body.remove_space_ids);
  }

  for (const m of body.memberships ?? []) {
    await supabase.from("space_memberships").upsert(
      {
        space_id: m.space_id,
        user_id: body.user_id,
        role: m.role,
      },
      { onConflict: "space_id,user_id" },
    );
    await logActivity(
      {
        user_id: user.id,
        space_id: m.space_id,
        action: "change_role",
        target_type: "user",
        target_id: body.user_id,
        details: { role: m.role },
      },
      supabase,
    );
  }

  return NextResponse.json({ ok: true });
}
