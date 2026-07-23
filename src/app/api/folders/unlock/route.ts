import { NextResponse } from "next/server";
import { requireUser, logActivity } from "@/lib/auth";
import { unlockExpiryDate, verifyPasscode } from "@/lib/passcode";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user, supabase } = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await request.json()) as {
    folder_id?: string;
    passcode?: string;
  };

  if (!body.folder_id || !body.passcode?.trim()) {
    return NextResponse.json(
      { error: "folder_id and passcode are required" },
      { status: 400 },
    );
  }

  const { data: folder } = await supabase
    .from("folders")
    .select("id,space_id,name,passcode_enabled,passcode_hash")
    .eq("id", body.folder_id)
    .single();

  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  if (!folder.passcode_enabled || !folder.passcode_hash) {
    return NextResponse.json(
      { error: "This folder is not locked" },
      { status: 400 },
    );
  }

  const ok = await verifyPasscode(body.passcode.trim(), folder.passcode_hash);
  if (!ok) {
    return NextResponse.json({ error: "Incorrect passcode" }, { status: 403 });
  }

  const until = unlockExpiryDate().toISOString();
  const { error } = await supabase.from("folder_unlocks").upsert(
    {
      user_id: user.id,
      folder_id: folder.id,
      unlocked_until: until,
    },
    { onConflict: "user_id,folder_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logActivity(
    {
      user_id: user.id,
      space_id: folder.space_id,
      action: "unlock_folder",
      target_type: "folder",
      target_id: folder.id,
      details: { name: folder.name },
    },
    supabase,
  );

  return NextResponse.json({ ok: true, unlocked_until: until });
}
