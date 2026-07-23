import type { SpaceMembership, SpaceRole } from "@/lib/types";

/** Client-safe role helper (no server imports). */
export function roleForSpace(
  memberships: SpaceMembership[],
  spaceId: string,
  isAdmin: boolean,
): SpaceRole | null {
  if (isAdmin) return "editor";
  return memberships.find((m) => m.space_id === spaceId)?.role ?? null;
}
