import type { SupabaseClient } from "@supabase/supabase-js";

export async function isSpaceBlocked(
  supabase: SupabaseClient,
  userId: string,
  spaceId: string,
): Promise<{ blocked: boolean }> {
  const { data: space } = await supabase
    .from("spaces")
    .select("id,requires_passcode,status")
    .eq("id", spaceId)
    .maybeSingle();

  if (!space || space.status === "archived") {
    return { blocked: true };
  }
  if (!space.requires_passcode) {
    return { blocked: false };
  }

  const { data: unlock } = await supabase
    .from("space_unlocks")
    .select("unlocked_until")
    .eq("user_id", userId)
    .eq("space_id", spaceId)
    .maybeSingle();

  if (
    unlock?.unlocked_until &&
    new Date(unlock.unlocked_until).getTime() > Date.now()
  ) {
    return { blocked: false };
  }

  return { blocked: true };
}
