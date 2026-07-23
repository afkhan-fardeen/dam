import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/categories";

export const runtime = "nodejs";

type ActivityRow = {
  id: string;
  user_id: string | null;
  space_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string | null;
};

function personName(
  profiles: Map<string, { full_name: string | null; email: string | null }>,
  userId: string | null,
): string {
  if (!userId) return "Someone";
  const p = profiles.get(userId);
  return p?.full_name || p?.email || "Someone";
}

function spaceName(spaces: Map<string, string>, spaceId: string | null): string {
  if (!spaceId) return "";
  return spaces.get(spaceId) || "";
}

function detailStr(details: Record<string, unknown> | null, key: string): string {
  const v = details?.[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

function summarize(
  row: ActivityRow,
  profiles: Map<string, { full_name: string | null; email: string | null }>,
  spaces: Map<string, string>,
  folderNames: Map<string, string>,
): string {
  const who = personName(profiles, row.user_id);
  const space = spaceName(spaces, row.space_id);
  const inSpace = space ? ` in ${space}` : "";
  const details = row.details;
  const fileName =
    detailStr(details, "original_name") ||
    detailStr(details, "name") ||
    "a file";
  const folderName =
    detailStr(details, "name") ||
    (typeof details?.folder_id === "string"
      ? folderNames.get(details.folder_id) || "a folder"
      : "a folder");

  switch (row.action) {
    case "login":
      return `${who} signed in`;
    case "upload":
      return `${who} uploaded ${fileName}${inSpace}`;
    case "download":
      return `${who} downloaded ${fileName}${inSpace}`;
    case "delete":
      return details?.permanent
        ? `${who} permanently deleted ${fileName}${inSpace}`
        : `${who} moved ${fileName} to trash${inSpace}`;
    case "restore":
      return `${who} restored ${fileName}${inSpace}`;
    case "create_folder":
      return `${who} created folder ${folderName}${inSpace}`;
    case "rename_folder":
      return `${who} renamed folder ${detailStr(details, "previous_name") || folderName} to ${detailStr(details, "name") || folderName}${inSpace}`;
    case "move_folder":
      return `${who} moved folder ${folderName}${inSpace}`;
    case "delete_folder":
      return `${who} deleted folder ${folderName}${inSpace}`;
    case "folder_passcode":
      return details?.passcode_enabled
        ? `${who} locked folder ${folderName}${inSpace}`
        : `${who} unlocked passcode on folder ${folderName}${inSpace}`;
    case "unlock_folder":
      return `${who} entered locked folder ${folderName}${inSpace}`;
    case "move_asset":
      return `${who} moved ${fileName}${inSpace}`;
    case "create_space":
      return `${who} created space ${detailStr(details, "name") || space || "a space"}`;
    case "create_user":
    case "invite_user": {
      const email = detailStr(details, "email") || "a user";
      return `${who} created account for ${email}`;
    }
    case "change_role": {
      const target =
        personName(profiles, row.target_id) !== "Someone"
          ? personName(profiles, row.target_id)
          : detailStr(details, "email") || "a user";
      const role =
        typeof details?.role === "string"
          ? ROLE_LABELS[details.role as keyof typeof ROLE_LABELS] || details.role
          : "a role";
      return `${who} set ${target} to ${role}${space ? ` on ${space}` : ""}`;
    }
    default:
      return `${who} performed ${row.action}${inSpace}`;
  }
}

export async function GET(request: Request) {
  const { ok, supabase } = await requireAdmin(request);
  if (!ok) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const spaceId = searchParams.get("space_id");
  const userId = searchParams.get("user_id");
  const action = searchParams.get("action");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let query = supabase
    .from("activity_log")
    .select("id,user_id,space_id,action,target_type,target_id,details,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (spaceId) query = query.eq("space_id", spaceId);
  if (userId) query = query.eq("user_id", userId);
  if (action) query = query.eq("action", action);
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) {
      query = query.gte("created_at", start.toISOString());
    }
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      query = query.lte("created_at", end.toISOString());
    }
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as ActivityRow[];
  const userIds = [
    ...new Set(
      rows
        .flatMap((r) => [r.user_id, r.target_id])
        .filter(Boolean) as string[],
    ),
  ];
  const spaceIds = [
    ...new Set(rows.map((r) => r.space_id).filter(Boolean) as string[]),
  ];

  const [{ data: profiles }, { data: spaces }, { data: folders }] =
    await Promise.all([
      userIds.length
        ? supabase
            .from("profiles")
            .select("id,full_name,email")
            .in("id", userIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
      spaceIds.length
        ? supabase.from("spaces").select("id,name").in("id", spaceIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      supabase.from("folders").select("id,name").limit(500),
    ]);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [
      p.id,
      { full_name: p.full_name, email: p.email },
    ]),
  );
  const spaceMap = new Map((spaces ?? []).map((b) => [b.id, b.name]));
  const folderMap = new Map((folders ?? []).map((f) => [f.id, f.name]));

  const entries = rows.map((row) => ({
    ...row,
    summary: summarize(row, profileMap, spaceMap, folderMap),
  }));

  return NextResponse.json({ entries });
}
