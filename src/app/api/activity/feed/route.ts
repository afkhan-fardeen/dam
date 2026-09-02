import { NextResponse } from "next/server";
import { requireDrive } from "@/lib/auth";

export const runtime = "nodejs";

type ActivityRow = {
  id: string;
  user_id: string | null;
  space_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

function detailStr(details: Record<string, unknown> | null, key: string): string {
  const v = details?.[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

function shortSummary(row: ActivityRow): string {
  const details = row.details;
  const fileName =
    detailStr(details, "original_name") ||
    detailStr(details, "name") ||
    detailStr(details, "relative_path") ||
    "an item";
  switch (row.action) {
    case "login":
      return "Signed in";
    case "upload":
      return `Uploaded ${fileName}`;
    case "download":
      return `Downloaded ${fileName}`;
    case "delete":
    case "trash":
      return `Trashed ${fileName}`;
    case "permanent_delete":
      return `Permanently deleted ${fileName}`;
    case "empty_trash":
      return "Emptied Recycle Bin";
    case "restore":
      return `Restored ${fileName}`;
    case "favorite":
      return `Favorited ${fileName}`;
    case "unfavorite":
      return `Unfavorited ${fileName}`;
    case "create_folder":
      return `Created folder ${detailStr(details, "name") || "folder"}`;
    case "error":
      return detailStr(details, "message") || "Error";
    default:
      return row.action.replace(/_/g, " ");
  }
}

function isErrorAction(action: string): boolean {
  return (
    action === "error" ||
    action.endsWith("_error") ||
    action.includes("fail")
  );
}

/** Recent portal activity (open drive — no login required). */
export async function GET(request: Request) {
  const { profile, effectiveUserId, supabase } = await requireDrive(request);
  if (!profile || !effectiveUserId) {
    return NextResponse.json({ error: "Portal not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    40,
    Math.max(1, Number(url.searchParams.get("limit") || 20) || 20),
  );

  const { data, error } = await supabase
    .from("activity_log")
    .select("id,user_id,space_id,action,details,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = ((data ?? []) as ActivityRow[]).map((row) => ({
    id: row.id,
    action: row.action,
    summary: shortSummary(row),
    created_at: row.created_at,
    space_id: row.space_id,
    is_error: isErrorAction(row.action),
  }));

  return NextResponse.json({ entries });
}
