const SIDEBAR_KEY = "dam.sidebarCollapsed";
const VIEW_MODE_KEY = "dam.viewMode";
const SORT_KEY = "dam.explorerSort";
const TRANSFER_POS_KEY = "dam.transferPanelPos";

export type ViewMode = "grid" | "list" | "photos";

export type ExplorerSortKey = "name" | "size" | "kind" | "date";

export type ExplorerSortPrefs = {
  key: ExplorerSortKey;
  asc: boolean;
  foldersFirst: boolean;
};

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
