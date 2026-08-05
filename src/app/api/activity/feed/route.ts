import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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
    "a file";
  switch (row.action) {
    case "login":
      return "Signed in";
    case "upload":
      return `Uploaded ${fileName}`;
    case "download":
      return `Downloaded ${fileName}`;
    case "delete":
      return `Trashed ${fileName}`;
    case "restore":
      return `Restored ${fileName}`;
    case "favorite":
      return `Favorited ${fileName}`;
    case "unfavorite":
      return `Unfavorited ${fileName}`;
    case "create_folder":
      return `Created folder ${detailStr(details, "name") || "folder"}`;
    default:
      return row.action.replace(/_/g, " ");
  }
}

/** Recent activity for the signed-in user (and their spaces). */
export async function GET(request: Request) {
  const { user, effectiveUserId, profile, supabase } =
    await requireUser(request);
  if (!user || !effectiveUserId || !profile) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("space_id")
    .eq("user_id", effectiveUserId);

  const spaceIds = (memberships ?? []).map((m) => m.space_id as string);
  const admin = getSupabaseAdmin();
  const limit = 8;

  let query = admin
    .from("activity_log")
    .select("id,user_id,space_id,action,details,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!profile.is_admin) {
    if (spaceIds.length > 0) {
      query = query.or(
        `user_id.eq.${effectiveUserId},space_id.in.(${spaceIds.join(",")})`,
      );
    } else {
      query = query.eq("user_id", effectiveUserId);
    }
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const entries = ((data ?? []) as ActivityRow[]).map((row) => ({
    id: row.id,
    action: row.action,
    summary: shortSummary(row),
    created_at: row.created_at,
    space_id: row.space_id,
  }));

  return NextResponse.json({ entries });
}
