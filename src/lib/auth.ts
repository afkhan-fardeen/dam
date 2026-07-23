import { createClient, createRouteClient } from "@/lib/supabase/server";
import type { Space, SpaceMembership, SpaceRole, Profile } from "@/lib/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export const VIEW_AS_COOKIE = "dam_view_as";

export type AuthContext = {
  supabase: SupabaseClient;
  user: User | null;
  /** Effective profile (respects view-as). */
  profile: Profile | null;
  /** Real signed-in profile (never swapped by view-as). */
  realProfile: Profile | null;
  /** User id for membership / favorites / unlocks (respects view-as). */
  effectiveUserId: string | null;
  viewingAs: Profile | null;
};

async function resolveViewAs(
  supabase: SupabaseClient,
  realProfile: Profile,
): Promise<{ profile: Profile; effectiveUserId: string; viewingAs: Profile | null }> {
  if (!realProfile.is_admin) {
    return {
      profile: realProfile,
      effectiveUserId: realProfile.id,
      viewingAs: null,
    };
  }

  try {
    const jar = await cookies();
    const viewAsId = jar.get(VIEW_AS_COOKIE)?.value;
    if (!viewAsId || viewAsId === realProfile.id) {
      return {
        profile: realProfile,
        effectiveUserId: realProfile.id,
        viewingAs: null,
      };
    }

    const { data: target } = await supabase
      .from("profiles")
      .select("id,full_name,email,is_admin,is_active,created_at")
      .eq("id", viewAsId)
      .single();

    if (!target || target.is_admin || target.is_active === false) {
      return {
        profile: realProfile,
        effectiveUserId: realProfile.id,
        viewingAs: null,
      };
    }

    const viewingAs = target as Profile;
    return {
      profile: { ...viewingAs, is_admin: false },
      effectiveUserId: viewingAs.id,
      viewingAs,
    };
  } catch {
    return {
      profile: realProfile,
      effectiveUserId: realProfile.id,
      viewingAs: null,
    };
  }
}

export async function requireUser(request?: Request): Promise<AuthContext> {
  const supabase = await createRouteClient(request);
  const bearer = request?.headers.get("authorization")?.startsWith("Bearer ")
    ? request.headers.get("authorization")!.slice(7)
    : undefined;

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(bearer);

  if (error || !user) {
    return {
      supabase,
      user: null,
      profile: null,
      realProfile: null,
      effectiveUserId: null,
      viewingAs: null,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,full_name,email,is_admin,is_active,created_at")
    .eq("id", user.id)
    .single();

  const realProfile = (profile as Profile | null) ?? null;
  if (!realProfile) {
    return {
      supabase,
      user,
      profile: null,
      realProfile: null,
      effectiveUserId: null,
      viewingAs: null,
    };
  }

  const resolved = await resolveViewAs(supabase, realProfile);
  return {
    supabase,
    user,
    profile: resolved.profile,
    realProfile,
    effectiveUserId: resolved.effectiveUserId,
    viewingAs: resolved.viewingAs,
  };
}

export async function requireAdmin(request?: Request) {
  const ctx = await requireUser(request);
  if (!ctx.user || !ctx.realProfile?.is_admin) {
    return { ...ctx, ok: false as const };
  }
  return { ...ctx, ok: true as const };
}

async function loadSpacesForUser(
  supabase: SupabaseClient,
  userId: string,
  isAdmin: boolean,
): Promise<{ spaces: Space[]; memberships: SpaceMembership[] }> {
  if (isAdmin) {
    const { data: spaces } = await supabase
      .from("spaces")
      .select(
        "id,name,slug,color,kind,requires_passcode,status,created_by,created_at",
      )
      .eq("status", "active")
      .order("name");
    return {
      spaces: (spaces ?? []) as Space[],
      memberships: [],
    };
  }

  const { data: memberships } = await supabase
    .from("space_memberships")
    .select("id,space_id,user_id,role,created_at")
    .eq("user_id", userId);

  const membershipList = (memberships ?? []) as SpaceMembership[];
  const spaceIds = membershipList.map((m) => m.space_id);
  if (spaceIds.length === 0) {
    return { spaces: [], memberships: membershipList };
  }

  const { data: spaces } = await supabase
    .from("spaces")
    .select(
      "id,name,slug,color,kind,requires_passcode,status,created_by,created_at",
    )
    .in("id", spaceIds)
    .eq("status", "active")
    .order("name");

  return {
    spaces: (spaces ?? []) as Space[],
    memberships: membershipList,
  };
}

export async function getUserSpaces() {
  const { supabase, user, profile, realProfile, viewingAs, effectiveUserId } =
    await requireUser();
  if (!user || !profile || !effectiveUserId) {
    return {
      spaces: [] as Space[],
      memberships: [] as SpaceMembership[],
      profile: null,
      user: null,
      realProfile: null as Profile | null,
      viewingAs: null as Profile | null,
    };
  }

  const { spaces, memberships } = await loadSpacesForUser(
    supabase,
    effectiveUserId,
    profile.is_admin,
  );

  return {
    spaces,
    memberships,
    profile,
    user,
    realProfile,
    viewingAs,
  };
}

export function roleForSpace(
  memberships: SpaceMembership[],
  spaceId: string,
  isAdmin: boolean,
): SpaceRole | null {
  if (isAdmin) return "editor";
  return memberships.find((m) => m.space_id === spaceId)?.role ?? null;
}

export async function logActivity(
  input: {
    user_id: string;
    space_id?: string | null;
    action: string;
    target_type?: string | null;
    target_id?: string | null;
    details?: Record<string, unknown> | null;
  },
  client?: SupabaseClient,
) {
  const supabase = client ?? (await createClient());
  await supabase.from("activity_log").insert({
    user_id: input.user_id,
    space_id: input.space_id ?? null,
    action: input.action,
    target_type: input.target_type ?? null,
    target_id: input.target_id ?? null,
    details: input.details ?? null,
  });
}
