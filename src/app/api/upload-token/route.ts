import { NextResponse } from "next/server";
import { requireUser, roleForSpace } from "@/lib/auth";
import { canEdit } from "@/lib/types";
import { signFileApiToken, getFileApiBaseUrl } from "@/lib/fileApiAuth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { user, profile, supabase } = await requireUser(request);
  if (!user || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { space_id?: string };
  if (!body.space_id) {
    return NextResponse.json({ error: "space_id is required" }, { status: 400 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", user.id);

  const role = roleForSpace(memberships ?? [], body.space_id, profile.is_admin);
  if (!canEdit(role, profile.is_admin)) {
    return NextResponse.json({ error: "You cannot upload to this space" }, { status: 403 });
  }

  try {
    const { token, expiresAt } = signFileApiToken("POST", "/upload");
    return NextResponse.json({
      token,
      expiresAt,
      uploadUrl: `${getFileApiBaseUrl()}/upload`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create upload token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
