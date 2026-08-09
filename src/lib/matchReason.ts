import type { Asset } from "@/lib/types";

/** Best-effort reason a hit matched the query (client or server). */
export function assetMatchReason(
  query: string,
  asset: Asset & { extracted_text?: string | null; brand?: string | null },
): string {
  const q = query.trim().toLowerCase();
  if (!q) return "Match";
  if (asset.original_name?.toLowerCase().includes(q)) return "Filename";
  if (asset.tags_text?.toLowerCase().includes(q)) return "Tags";
  if (asset.tags?.some((t) => t.name.toLowerCase().includes(q))) return "Tags";
  if (asset.brand?.toLowerCase().includes(q)) return "Brand";
  if (asset.description?.toLowerCase().includes(q)) return "Description";
  if (asset.created_by?.toLowerCase().includes(q)) return "Credit";
  if (asset.extracted_text?.toLowerCase().includes(q)) return "Matched in text";
  return "Match";
}

export function isImageMime(mime: string | null | undefined): boolean {
  return Boolean(mime && mime.startsWith("image/"));
}
