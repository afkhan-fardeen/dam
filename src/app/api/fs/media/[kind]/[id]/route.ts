import { NextResponse } from "next/server";
import { requireDrive, logActivity } from "@/lib/auth";
import { FS_NODE_COLS } from "@/lib/fsNodes";
import { signFileApiToken, buildFileApiUrl } from "@/lib/fileApiAuth";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ kind: string; id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { profile, effectiveUserId, supabase } = await requireDrive(request);
    if (!profile || !effectiveUserId) {
      return NextResponse.json(
        { error: "Portal not configured" },
        { status: 503 },
      );
    }

    if (!process.env.FILE_API_BASE_URL || !process.env.FILE_API_KEY) {
      return NextResponse.json(
        {
          error:
            "File server is not configured (FILE_API_BASE_URL / FILE_API_KEY)",
        },
        { status: 503 },
      );
    }

    const { kind, id } = await context.params;
    if (kind !== "file" && kind !== "thumbnail") {
      return NextResponse.json({ error: "Unknown kind" }, { status: 400 });
    }

    const { data: node, error } = await supabase
      .from("fs_nodes")
      .select(FS_NODE_COLS)
      .eq("id", id)
      .eq("is_deleted", false)
      .maybeSingle();
    if (error || !node) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (node.node_type !== "file") {
      return NextResponse.json({ error: "Not a file" }, { status: 400 });
    }

    const fsPath = kind === "file" ? "/fs/read" : "/fs/thumbnail";
    const { token } = signFileApiToken("GET", fsPath);
    const upstreamUrl = buildFileApiUrl(
      `${fsPath}?path=${encodeURIComponent(node.relative_path)}`,
      token,
    );

    const forwardHeaders: Record<string, string> = {
      "x-auth-token": token,
      "ngrok-skip-browser-warning": "true",
      "User-Agent": "DAM-NextFsProxy/1.0",
    };
    const range = request.headers.get("range");
    if (range && kind === "file") forwardHeaders.Range = range;

    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        headers: forwardHeaders,
        cache: "no-store",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not reach file server";
      return NextResponse.json(
        {
          error: "File server unreachable",
          detail: message.slice(0, 200),
        },
        { status: 502 },
      );
    }

    if (!upstream.ok && upstream.status !== 206) {
      const detail = await upstream.text().catch(() => "");
      return NextResponse.json(
        {
          error:
            upstream.status === 404
              ? "File missing on disk"
              : "Could not load media",
          status: upstream.status,
          detail: detail.slice(0, 200),
          path: node.relative_path,
        },
        { status: 502 },
      );
    }

    if (kind === "file" && upstream.status === 200 && !range) {
      await logActivity(
        {
          user_id: effectiveUserId,
          action: "download",
          target_type: "fs_node",
          target_id: node.id,
        },
        supabase,
      );
    }

    const headers = new Headers();
    const contentType =
      upstream.headers.get("content-type") ||
      (kind === "thumbnail" ? "image/jpeg" : node.mime_type) ||
      "application/octet-stream";
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "private, max-age=60");
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) headers.set("Accept-Ranges", acceptRanges);
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("Content-Range", contentRange);

    const download = new URL(request.url).searchParams.get("download");
    if (kind === "file") {
      headers.set(
        "Content-Disposition",
        download
          ? `attachment; filename="${node.name.replace(/"/g, "")}"`
          : `inline; filename="${node.name.replace(/"/g, "")}"`,
      );
    }

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Media proxy failed";
    console.error("[fs/media]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
