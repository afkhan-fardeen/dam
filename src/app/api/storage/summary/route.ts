import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import type { Space, SpaceMembership } from "@/lib/types";

export const runtime = "nodejs";

async function accessibleSpaces(
  supabase: Awaited<ReturnType<typeof requireUser>>["supabase"],
  userId: string,
  isAdmin: boolean,
): Promise<Space[]> {
  if (isAdmin) {
    const { data } = await supabase
      .from("spaces")
      .select(
        "id,name,slug,color,kind,requires_passcode,status,created_by,created_at",
      )
      .eq("status", "active")
      .order("name");
    return (data ?? []) as Space[];
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("space_id")
    .eq("user_id", userId);

  const ids = ((memberships ?? []) as Pick<SpaceMembership, "space_id">[]).map(
    (m) => m.space_id,
  );
  if (ids.length === 0) return [];

  const { data } = await supabase
    .from("spaces")
    .select(
      "id,name,slug,color,kind,requires_passcode,status,created_by,created_at",
    )
    .in("id", ids)
    .eq("status", "active")
    .order("name");

  return (data ?? []) as Space[];
}

export async function GET(request: Request) {
  const { user, profile, effectiveUserId, supabase } =
    await requireUser(request);
  if (!user || !profile || !effectiveUserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const spaces = await accessibleSpaces(
    supabase,
    effectiveUserId,
    profile.is_admin,
  );
  const spaceIds = spaces.map((s) => s.id);

  const bySpace = new Map<string, number>();
  if (spaceIds.length > 0) {
    const { data: assets } = await supabase
      .from("assets")
      .select("space_id,size")
      .eq("status", "active")
      .in("space_id", spaceIds);

    for (const a of assets ?? []) {
      if (!a.space_id) continue;
      bySpace.set(
        a.space_id,
        (bySpace.get(a.space_id) || 0) + Number(a.size || 0),
      );
    }
  }

  const places = spaces.map((s) => ({
    space_id: s.id,
    name: s.name,
    slug: s.slug,
    color: s.color,
    bytes: bySpace.get(s.id) || 0,
  }));

  const usedBytes = places.reduce((sum, p) => sum + p.bytes, 0);

  const rawQuota = process.env.DAM_STORAGE_QUOTA_BYTES?.trim();
  const parsed = rawQuota ? Number(rawQuota) : NaN;
  const quotaBytes =
    Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;

  return NextResponse.json({
    usedBytes,
    quotaBytes,
    availableBytes:
      quotaBytes != null ? Math.max(0, quotaBytes - usedBytes) : null,
    places,
  });
}
