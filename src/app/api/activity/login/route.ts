import { NextResponse } from "next/server";
import { requireUser, logActivity } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user, supabase } = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await logActivity(
    {
      user_id: user.id,
      action: "login",
      target_type: "user",
      target_id: user.id,
    },
    supabase,
  );
  return NextResponse.json({ ok: true });
}
