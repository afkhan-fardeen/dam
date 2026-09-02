const SIDEBAR_KEY = "dam.sidebarCollapsed";
const VIEW_MODE_KEY = "dam.viewMode";
const SORT_KEY = "dam.explorerSort";
const TRANSFER_POS_KEY = "dam.transferPanelPos";
const NAV_WIDTH_KEY = "dam.navWidth";
const DETAILS_WIDTH_KEY = "dam.detailsWidth";

export type ViewMode = "grid" | "list" | "photos";

export type ExplorerSortKey = "name" | "size" | "kind" | "date";

export type ExplorerSortPrefs = {
  key: ExplorerSortKey;
  asc: boolean;
  foldersFirst: boolean;
};

const NAV_DEFAULT = 220;
const NAV_MIN = 180;
const NAV_MAX = 360;
const DETAILS_DEFAULT = 280;
const DETAILS_MIN = 240;
const DETAILS_MAX = 420;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function readSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function readViewMode(): ViewMode {
  if (typeof window === "undefined") return "list";
  try {
    const v = window.localStorage.getItem(VIEW_MODE_KEY);
    if (v === "list" || v === "grid" || v === "photos") return v;
    return "list";
  } catch {
    return "list";
  }
}

export function writeViewMode(mode: ViewMode) {
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function readExplorerSort(): ExplorerSortPrefs {
  const fallback: ExplorerSortPrefs = {
    key: "name",
    asc: true,
    foldersFirst: true,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(SORT_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<ExplorerSortPrefs>;
    const key = parsed.key;
    if (key !== "name" && key !== "size" && key !== "kind" && key !== "date") {
      return fallback;
    }
    return {
      key,
      asc: parsed.asc !== false,
      foldersFirst: parsed.foldersFirst !== false,
    };
  } catch {
    return fallback;
  }
}

export function writeExplorerSort(prefs: ExplorerSortPrefs) {
  try {
    window.localStorage.setItem(SORT_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function readTransferPanelPos(): { left: number; top: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TRANSFER_POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { left?: number; top?: number };
    if (typeof parsed.left !== "number" || typeof parsed.top !== "number") {
      return null;
    }
    return { left: parsed.left, top: parsed.top };
  } catch {
    return null;
  }
}

export function writeTransferPanelPos(pos: { left: number; top: number }) {
  try {
    window.localStorage.setItem(TRANSFER_POS_KEY, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

export function readNavWidth(): number {
  if (typeof window === "undefined") return NAV_DEFAULT;
  try {
    const n = Number(window.localStorage.getItem(NAV_WIDTH_KEY));
    if (!Number.isFinite(n)) return NAV_DEFAULT;
    return clamp(n, NAV_MIN, NAV_MAX);
  } catch {
    return NAV_DEFAULT;
  }
}

export function writeNavWidth(width: number) {
  try {
    window.localStorage.setItem(
      NAV_WIDTH_KEY,
      String(clamp(width, NAV_MIN, NAV_MAX)),
    );
  } catch {
    /* ignore */
  }
}

export function readDetailsWidth(): number {
  if (typeof window === "undefined") return DETAILS_DEFAULT;
  try {
    const n = Number(window.localStorage.getItem(DETAILS_WIDTH_KEY));
    if (!Number.isFinite(n)) return DETAILS_DEFAULT;
    return clamp(n, DETAILS_MIN, DETAILS_MAX);
  } catch {
    return DETAILS_DEFAULT;
  }
}

export function writeDetailsWidth(width: number) {
  try {
    window.localStorage.setItem(
      DETAILS_WIDTH_KEY,
      String(clamp(width, DETAILS_MIN, DETAILS_MAX)),
    );
  } catch {
    /* ignore */
  }
}

export const PANE_LIMITS = {
  navMin: NAV_MIN,
  navMax: NAV_MAX,
  detailsMin: DETAILS_MIN,
  detailsMax: DETAILS_MAX,
} as const;
