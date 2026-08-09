import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { resolveEffectiveFolderMeta } from "@/lib/folderInheritance";

export const runtime = "nodejs";

/** Effective brand + tags for a folder (inheritance). */
export async function GET(request: Request) {
  const { user, profile, supabase } = await requireUser(request);
  if (!user || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const spaceId = searchParams.get("space_id");
  const folderId = searchParams.get("folder_id");
  if (!spaceId) {
    return NextResponse.json({ error: "space_id is required" }, { status: 400 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("space_id")
    .eq("user_id", user.id);
  const memberIds = new Set((memberships ?? []).map((m) => m.space_id));
  if (!profile.is_admin && !memberIds.has(spaceId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: space } = await supabase
    .from("spaces")
    .select("kind,name")
    .eq("id", spaceId)
    .maybeSingle();

  try {
    const effective = await resolveEffectiveFolderMeta(
      supabase,
      spaceId,
      folderId || null,
      space?.kind,
      space?.name,
    );
    return NextResponse.json({ effective });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not resolve folder metadata";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
