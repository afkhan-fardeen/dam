const SIDEBAR_KEY = "dam.sidebarCollapsed";
const VIEW_MODE_KEY = "dam.viewMode";

export type ViewMode = "grid" | "list";

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
  if (typeof window === "undefined") return "grid";
  try {
    const v = window.localStorage.getItem(VIEW_MODE_KEY);
    return v === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export function writeViewMode(mode: ViewMode) {
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}
