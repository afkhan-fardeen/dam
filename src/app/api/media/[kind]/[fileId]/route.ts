import { NextResponse } from "next/server";
import { requireUser, logActivity, roleForSpace } from "@/lib/auth";
import { canDownload } from "@/lib/types";
import {
  buildFileApiUrl,
  signFileApiToken,
} from "@/lib/fileApiAuth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ kind: string; fileId: string }>;
};

/**
 * Proxies thumbnail/asset bytes through Next.js so <img> and browser
 * navigations work with ngrok (which blocks bare browser User-Agents).
 * Forwards Range requests so HTML5 video seeking works when the Windows
 * file API supports 206 Partial Content.
 */
export async function GET(request: Request, context: RouteContext) {
  const { user, profile, supabase } = await requireUser(request);
  if (!user || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { kind, fileId } = await context.params;
  if (kind !== "thumbnail" && kind !== "asset") {
    return NextResponse.json({ error: "Unknown media kind" }, { status: 400 });
  }
  if (!fileId) {
    return NextResponse.json({ error: "Missing file id" }, { status: 400 });
  }

  const { data: asset, error } = await supabase
    .from("assets")
    .select("id,file_id,space_id,status,mime_type")
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
  const { token } = signFileApiToken("GET", path);
  const upstreamUrl = buildFileApiUrl(path, token);

  const forwardHeaders: Record<string, string> = {
    "ngrok-skip-browser-warning": "true",
    "User-Agent": "DAM-NextMediaProxy/1.0",
  };
  const range = request.headers.get("range");
  if (range && kind === "asset") {
    forwardHeaders.Range = range;
  }

  const upstream = await fetch(upstreamUrl, {
    headers: forwardHeaders,
    cache: "no-store",
  });

  // 206 Partial Content is success for ranged video seeks
  if (!upstream.ok && upstream.status !== 206) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      {
        error: "Could not load media",
        status: upstream.status,
        detail: detail.slice(0, 200),
      },
      { status: 502 },
    );
  }

  // Only count intentional downloads — not lightbox / <img> / <video> previews.
  const wantsDownload =
    new URL(request.url).searchParams.get("download") === "1";
  if (
    kind === "asset" &&
    wantsDownload &&
    upstream.status === 200 &&
    !range
  ) {
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

  const contentType =
    upstream.headers.get("content-type") ||
    (kind === "thumbnail" ? "image/jpeg" : asset.mime_type) ||
    "application/octet-stream";

  const headers = new Headers();
  headers.set("Content-Type", contentType);
  // Thumbnails are tiny and browsed rapidly — cache longer in the browser.
  headers.set(
    "Cache-Control",
    kind === "thumbnail"
      ? "private, max-age=3600, stale-while-revalidate=86400"
      : "private, max-age=300, stale-while-revalidate=3600",
  );

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  const acceptRanges = upstream.headers.get("accept-ranges");
  if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);
  else if (kind === "asset") headers.set("Accept-Ranges", "bytes");

  const contentRange = upstream.headers.get("content-range");
  if (contentRange) headers.set("Content-Range", contentRange);

  if (kind === "asset") {
    headers.set(
      "Content-Disposition",
      `inline; filename="${fileId}"`,
    );
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers,
  });
}
