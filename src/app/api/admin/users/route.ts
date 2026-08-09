import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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

async function countActiveAdmins(supabase: SupabaseClient) {
  const { data } = await supabase
    .from("profiles")
    .select("id,is_active")
    .eq("is_admin", true);
  return (data ?? []).filter((p) => p.is_active !== false).length;
}

export async function GET(request: Request) {
  const { ok, user, supabase } = await requireAdmin(request);
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
    me: user?.id ?? null,
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
    full_name?: string;
    email?: string;
    memberships?: MembershipInput[];
    is_admin?: boolean;
    is_active?: boolean;
    password?: string;
    remove_space_ids?: string[];
  };

  if (!body.user_id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("id,email,full_name,is_admin,is_active")
    .eq("id", body.user_id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const admin = getSupabaseAdmin();
  const profilePatch: {
    full_name?: string;
    email?: string;
    is_admin?: boolean;
    is_active?: boolean;
  } = {};

  if (typeof body.full_name === "string") {
    profilePatch.full_name = body.full_name.trim();
  }

  if (typeof body.email === "string") {
    const email = body.email.trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    if (email !== (target.email || "").toLowerCase()) {
      const { error: emailError } = await admin.auth.admin.updateUserById(
        body.user_id,
        { email, email_confirm: true },
      );
      if (emailError) {
        return NextResponse.json({ error: emailError.message }, { status: 400 });
      }
      profilePatch.email = email;
    }
  }

  if (typeof body.password === "string") {
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 },
      );
    }
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
    if (body.is_admin === false && target.is_admin) {
      if (body.user_id === user.id) {
        return NextResponse.json(
          { error: "You can’t remove your own admin access." },
          { status: 400 },
        );
      }
      const admins = await countActiveAdmins(supabase);
      if (admins <= 1) {
        return NextResponse.json(
          { error: "Keep at least one active admin." },
          { status: 400 },
        );
      }
    }
    profilePatch.is_admin = body.is_admin;
  }

  if (typeof body.is_active === "boolean") {
    if (body.is_active === false) {
      if (body.user_id === user.id) {
        return NextResponse.json(
          { error: "You can’t deactivate your own account." },
          { status: 400 },
        );
      }
      if (target.is_admin) {
        const admins = await countActiveAdmins(supabase);
        if (admins <= 1) {
          return NextResponse.json(
            { error: "Keep at least one active admin." },
            { status: 400 },
          );
        }
      }
    }
    profilePatch.is_active = body.is_active;
  }

  if (Object.keys(profilePatch).length > 0) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update(profilePatch)
      .eq("id", body.user_id);
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }
    await logActivity(
      {
        user_id: user.id,
        action: "update_user",
        target_type: "user",
        target_id: body.user_id,
        details: profilePatch,
      },
      supabase,
    );
  }

  if (body.remove_space_ids?.length) {
    await supabase
      .from("space_memberships")
      .delete()
      .eq("user_id", body.user_id)
      .in("space_id", body.remove_space_ids);
  }

  for (const m of body.memberships ?? []) {
    if (!m.space_id || !["viewer", "downloader", "editor"].includes(m.role)) {
      continue;
    }
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

export async function DELETE(request: Request) {
  const { ok, user, supabase } = await requireAdmin(request);
  if (!ok || !user) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    user_id?: string;
  };
  const userId =
    body.user_id || new URL(request.url).searchParams.get("user_id") || "";

  if (!userId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  if (userId === user.id) {
    return NextResponse.json(
      { error: "You can’t delete your own account." },
      { status: 400 },
    );
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("id,email,full_name,is_admin,is_active")
    .eq("id", userId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.is_admin && target.is_active !== false) {
    const admins = await countActiveAdmins(supabase);
    if (admins <= 1) {
      return NextResponse.json(
        { error: "Keep at least one active admin." },
        { status: 400 },
      );
    }
  }

  // Clear memberships first (belt-and-suspenders; auth delete cascades profile)
  await supabase.from("space_memberships").delete().eq("user_id", userId);

  const admin = getSupabaseAdmin();
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  await logActivity(
    {
      user_id: user.id,
      action: "delete_user",
      target_type: "user",
      target_id: userId,
      details: {
        email: target.email,
        full_name: target.full_name,
      },
    },
    supabase,
  );

  return NextResponse.json({ ok: true });
}
