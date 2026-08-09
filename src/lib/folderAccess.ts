import type { SupabaseClient } from "@supabase/supabase-js";

export type FolderLockInfo = {
  id: string;
  space_id: string;
  parent_folder_id: string | null;
  name: string;
  passcode_enabled: boolean;
};

/** Collect folder id + all ancestor ids (2 queries: folder + space tree). */
export async function getFolderAncestorIds(
  supabase: SupabaseClient,
  folderId: string,
): Promise<string[]> {
  const { data: folder } = await supabase
    .from("folders")
    .select("id,space_id,parent_folder_id")
    .eq("id", folderId)
    .maybeSingle<{
      id: string;
      space_id: string;
      parent_folder_id: string | null;
    }>();

  if (!folder) return [];

  const { data: spaceFolders } = await supabase
    .from("folders")
    .select("id,parent_folder_id")
    .eq("space_id", folder.space_id);

  const byId = new Map(
    (spaceFolders ?? []).map((f) => [
      f.id as string,
      f.parent_folder_id as string | null,
    ]),
  );

  const ids: string[] = [];
  let current: string | null = folderId;
  const seen = new Set<string>();

  while (current && !seen.has(current)) {
    seen.add(current);
    ids.push(current);
    current = byId.has(current) ? byId.get(current)! : null;
  }

  return ids;
}

/** True if folder (or any ancestor) is locked and user has no valid unlock. */
export async function isFolderBlocked(
  supabase: SupabaseClient,
  userId: string,
  folderId: string | null,
): Promise<{ blocked: boolean; lockedFolderId: string | null }> {
  if (!folderId) return { blocked: false, lockedFolderId: null };

  const ancestorIds = await getFolderAncestorIds(supabase, folderId);
  if (ancestorIds.length === 0) {
    return { blocked: false, lockedFolderId: null };
  }

  const { data: folders } = await supabase
    .from("folders")
    .select("id,passcode_enabled")
    .in("id", ancestorIds);

  const lockedIds = (folders ?? [])
    .filter((f) => f.passcode_enabled)
    .map((f) => f.id as string);

  if (lockedIds.length === 0) {
    return { blocked: false, lockedFolderId: null };
  }

  const { data: unlocks } = await supabase
    .from("folder_unlocks")
    .select("folder_id,unlocked_until")
    .eq("user_id", userId)
    .in("folder_id", lockedIds);

  const now = Date.now();
  const unlocked = new Set(
    (unlocks ?? [])
      .filter((u) => new Date(u.unlocked_until).getTime() > now)
      .map((u) => u.folder_id as string),
  );

  // Walk from closest folder to root — first locked without unlock blocks
  for (const id of ancestorIds) {
    if (lockedIds.includes(id) && !unlocked.has(id)) {
      return { blocked: true, lockedFolderId: id };
    }
  }

  return { blocked: false, lockedFolderId: null };
}

/** Folder ids the user cannot enter (locked, no unlock). */
export async function getBlockedFolderIds(
  supabase: SupabaseClient,
  userId: string,
  spaceFolderRows: { id: string; parent_folder_id: string | null; passcode_enabled: boolean }[],
): Promise<Set<string>> {
  const byId = new Map(spaceFolderRows.map((f) => [f.id, f]));
  const locked = spaceFolderRows.filter((f) => f.passcode_enabled).map((f) => f.id);

  const unlocked = new Set<string>();
  if (locked.length > 0) {
    const { data: unlocks } = await supabase
      .from("folder_unlocks")
      .select("folder_id,unlocked_until")
      .eq("user_id", userId)
      .in("folder_id", locked);
    const now = Date.now();
    for (const u of unlocks ?? []) {
      if (new Date(u.unlocked_until).getTime() > now) {
        unlocked.add(u.folder_id);
      }
    }
  }

  function chainLocked(folderId: string): boolean {
    let current: string | null = folderId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      const row = byId.get(current);
      if (!row) break;
      if (row.passcode_enabled && !unlocked.has(current)) return true;
      current = row.parent_folder_id;
    }
    return false;
  }

  const blocked = new Set<string>();
  for (const f of spaceFolderRows) {
    if (chainLocked(f.id)) blocked.add(f.id);
  }
  return blocked;
}
