import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { buildFileApiUrl, signFileApiToken } from "@/lib/fileApiAuth";

export const runtime = "nodejs";

function serviceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function hashPassword(pw: string): string {
  return createHash("sha256").update(pw).digest("hex");
}

/** Public media for a valid share link. */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "asset" ? "asset" : "thumbnail";
  const password = url.searchParams.get("password") || "";
  const supabase = serviceClient();

  const { data: link } = await supabase
    .from("share_links")
    .select("asset_id,can_download,expires_at,revoked_at,password_hash")
    .eq("token", token)
    .maybeSingle();

  if (!link || link.revoked_at) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    return NextResponse.json({ error: "Expired" }, { status: 410 });
  }
  if (link.password_hash && hashPassword(password) !== link.password_hash) {
    return NextResponse.json({ error: "Password required" }, { status: 401 });
  }
  if (kind === "asset" && !link.can_download) {
    return NextResponse.json({ error: "Download disabled" }, { status: 403 });
  }

  const { data: asset } = await supabase
    .from("assets")
    .select("file_id,mime_type")
    .eq("id", link.asset_id)
    .maybeSingle();
  if (!asset?.file_id) {
    return NextResponse.json({ error: "Missing file" }, { status: 404 });
  }

  const path =
    kind === "thumbnail"
      ? `/thumbnail/${asset.file_id}`
      : `/asset/${asset.file_id}`;
  const { token: signed } = signFileApiToken("GET", path);
  const upstreamUrl = buildFileApiUrl(path, signed);

  const upstreamRes = await fetch(upstreamUrl, {
    headers: {
      "ngrok-skip-browser-warning": "true",
      "User-Agent": "DAM-ShareMediaProxy/1.0",
    },
    cache: "no-store",
  });

  if (!upstreamRes.ok) {
    return NextResponse.json(
      { error: "Upstream media failed" },
      { status: 502 },
    );
  }

  const headers = new Headers();
  const ct = upstreamRes.headers.get("content-type");
  if (ct) headers.set("Content-Type", ct);
  headers.set("Cache-Control", "private, max-age=300");

  return new NextResponse(upstreamRes.body, { status: 200, headers });
}
