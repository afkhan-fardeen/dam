import { NextResponse } from "next/server";
import { requireUser, logActivity, roleForSpace } from "@/lib/auth";
import { canDownload } from "@/lib/types";
import { buildFileApiUrl, signFileApiToken } from "@/lib/fileApiAuth";

export const runtime = "nodejs";

type TokenBody = {
  fileId?: string;
  kind?: "asset" | "thumbnail";
};

export async function POST(request: Request) {
  const { user, profile, supabase } = await requireUser(request);
  if (!user || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as TokenBody;
    const fileId = body.fileId?.trim();
    const kind = body.kind ?? "asset";

    if (!fileId) {
      return NextResponse.json({ error: "Missing file id" }, { status: 400 });
    }

    const { data: asset, error } = await supabase
      .from("assets")
      .select("id,file_id,space_id,status")
      .eq("file_id", fileId)
      .eq("status", "active")
      .maybeSingle();

    if (error || !asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const { data: memberships } = await supabase
      .from("space_memberships")
      .select("id,space_id,user_id,role,created_at")
      .eq("user_id", user.id);

    const role = roleForSpace(memberships ?? [], asset.space_id, profile.is_admin);

    if (kind === "asset" && !canDownload(role, profile.is_admin)) {
      return NextResponse.json(
        { error: "You can view this file, but not download the original." },
        { status: 403 },
      );
    }

    const path =
      kind === "thumbnail" ? `/thumbnail/${fileId}` : `/asset/${fileId}`;
    const { token, expiresAt } = signFileApiToken("GET", path);
    const url = buildFileApiUrl(path, token);

    if (kind === "asset") {
      await logActivity(
        {
          user_id: user.id,
          space_id: asset.space_id,
          action: "download",
          target_type: "asset",
          target_id: asset.id,
        },
        supabase,
      );
    }

    return NextResponse.json({ token, expiresAt, url, path });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not create asset token";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
