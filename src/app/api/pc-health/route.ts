import { NextResponse } from "next/server";
import { getFileApiBaseUrl } from "@/lib/fileApiAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side probe of the Windows file API /health.
 * Avoids browser false positives from ngrok interstitial HTML (HTTP 200).
 */
export async function GET() {
  let base: string;
  try {
    base = getFileApiBaseUrl();
  } catch {
    return NextResponse.json({ connected: false, reason: "not_configured" });
  }

  try {
    const upstream = await fetch(`${base}/health`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
      headers: {
        "ngrok-skip-browser-warning": "true",
        Accept: "application/json",
        "User-Agent": "DAM-PcHealth/1.0",
      },
    });

    if (!upstream.ok) {
      return NextResponse.json({
        connected: false,
        reason: "upstream_status",
        status: upstream.status,
      });
    }

    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      return NextResponse.json({
        connected: false,
        reason: "not_json",
      });
    }

    const body = (await upstream.json()) as {
      ok?: unknown;
      status?: unknown;
    };
    // Windows file API returns { status: "ok" }; sketch used { ok: true }.
    const healthy = body?.ok === true || body?.status === "ok";
    if (!healthy) {
      return NextResponse.json({
        connected: false,
        reason: "bad_payload",
      });
    }

    return NextResponse.json({ connected: true });
  } catch {
    return NextResponse.json({ connected: false, reason: "unreachable" });
  }
}
