export type LastPlace = {
  spaceSlug: string;
  spaceName: string;
  folderId: string | null;
  folderName: string | null;
};

const KEY = "dam_last_place_v1";

export function readLastPlace(): LastPlace | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastPlace;
    if (!parsed?.spaceSlug || !parsed?.spaceName) return null;
    return {
      spaceSlug: String(parsed.spaceSlug),
      spaceName: String(parsed.spaceName),
      folderId: parsed.folderId ? String(parsed.folderId) : null,
      folderName: parsed.folderName ? String(parsed.folderName) : null,
    };
  } catch {
    return null;
  }
}

export function writeLastPlace(place: LastPlace): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(place));
  } catch {
    /* quota / private mode */
  }
}

export function lastPlaceHref(place: LastPlace): string {
  if (place.folderId) {
    return `/s/${place.spaceSlug}?folder=${encodeURIComponent(place.folderId)}`;
  }
  return `/s/${place.spaceSlug}`;
}

export function lastPlaceLabel(place: LastPlace): string {
  if (place.folderName) return `${place.spaceName} / ${place.folderName}`;
  return place.spaceName;
}
