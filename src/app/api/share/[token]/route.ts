import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}

function hashPassword(pw: string): string {
  return createHash("sha256").update(pw).digest("hex");
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const password = new URL(request.url).searchParams.get("password") || "";
  const supabase = serviceClient();

  const { data: link } = await supabase
    .from("share_links")
    .select(
      "id,asset_id,can_download,expires_at,revoked_at,password_hash",
    )
    .eq("token", token)
    .maybeSingle();

  if (!link || link.revoked_at) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 });
  }
  if (link.password_hash) {
    if (!password || hashPassword(password) !== link.password_hash) {
      return NextResponse.json(
        { error: "Password required", needs_password: true },
        { status: 401 },
      );
    }
  }

  const { data: asset } = await supabase
    .from("assets")
    .select(
      "id,file_id,original_name,mime_type,size,has_thumbnail,description",
    )
    .eq("id", link.asset_id)
    .maybeSingle();

  if (!asset) {
    return NextResponse.json({ error: "Asset missing" }, { status: 404 });
  }

  return NextResponse.json({
    asset,
    can_download: link.can_download,
  });
}
