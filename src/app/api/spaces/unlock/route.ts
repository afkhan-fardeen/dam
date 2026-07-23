import { NextResponse } from "next/server";
import { requireUser, logActivity } from "@/lib/auth";
import { unlockExpiryDate, verifyPasscode } from "@/lib/passcode";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user, effectiveUserId, supabase } = await requireUser(request);
  if (!user || !effectiveUserId) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await request.json()) as {
    space_id?: string;
    passcode?: string;
  };

  if (!body.space_id || !body.passcode?.trim()) {
    return NextResponse.json(
      { error: "space_id and passcode are required" },
      { status: 400 },
    );
  }

  const { data: space } = await supabase
    .from("spaces")
    .select("id,name,requires_passcode,passcode_hash,status")
    .eq("id", body.space_id)
    .single();

  if (!space || space.status === "archived") {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  if (!space.requires_passcode || !space.passcode_hash) {
    return NextResponse.json(
      { error: "This space is not locked" },
      { status: 400 },
    );
  }

  const ok = await verifyPasscode(body.passcode.trim(), space.passcode_hash);
  if (!ok) {
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 403 });
  }

  const until = unlockExpiryDate().toISOString();
  const client =
    effectiveUserId !== user.id ? getSupabaseAdmin() : supabase;
  const { error } = await client.from("space_unlocks").upsert(
    {
      user_id: effectiveUserId,
      space_id: space.id,
      unlocked_until: until,
    },
    { onConflict: "user_id,space_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(
    {
      user_id: user.id,
      space_id: space.id,
      action: "unlock_space",
      target_type: "space",
      target_id: space.id,
      details: { name: space.name },
    },
    supabase,
  );

  return NextResponse.json({ ok: true, unlocked_until: until });
}
