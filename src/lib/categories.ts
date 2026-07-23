import type { CSSProperties } from "react";

export const ROLE_LABELS: Record<string, string> = {
  viewer: "Viewer",
  downloader: "Downloader",
  editor: "Editor",
};

export const SPACE_COLOR_PRESETS = ["#4F6BFF", "#FF6B4A", "#0D9488", "#8B5CF6"];

const TAG_PALETTE = [
  { bg: "rgba(10,132,255,0.14)", text: "#0077E6" },
  { bg: "rgba(48,209,88,0.16)", text: "#1B7A32" },
  { bg: "rgba(255,159,10,0.18)", text: "#C45F00" },
  { bg: "rgba(191,90,242,0.16)", text: "#7A3AAD" },
  { bg: "rgba(255,55,95,0.14)", text: "#C41245" },
  { bg: "rgba(100,210,255,0.2)", text: "#1A8FA8" },
] as const;

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Varied chip colors per tag name (design-new §4). */
export function getTagChipStyles(name?: string | null) {
  const key = (name || "").trim() || "tag";
  const swatch = TAG_PALETTE[hashName(key.toLowerCase()) % TAG_PALETTE.length];
  return {
    chipBg: "",
    chipText: "",
    style: {
      background: swatch.bg,
      color: swatch.text,
    } as CSSProperties,
  };
}

/** @deprecated kept for any leftover imports — prefer getTagChipStyles */
export const BRAND_COLOR_PRESETS = SPACE_COLOR_PRESETS;
