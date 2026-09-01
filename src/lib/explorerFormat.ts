/** Display helpers for Explorer list/details */

export function formatBytes(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatModified(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fileTypeLabel(
  nodeType: "file" | "folder",
  mime: string | null | undefined,
  name: string,
): string {
  if (nodeType === "folder") return "File folder";
  if (mime) {
    if (mime.startsWith("image/")) return "Image";
    if (mime.startsWith("video/")) return "Video";
    if (mime.startsWith("audio/")) return "Audio";
    if (mime === "application/pdf") return "PDF document";
    if (mime.includes("spreadsheet") || mime.includes("excel")) return "Spreadsheet";
    if (mime.includes("presentation") || mime.includes("powerpoint"))
      return "Presentation";
    if (mime.includes("word") || mime.includes("document")) return "Document";
    if (mime.startsWith("text/")) return "Text document";
  }
  const ext = name.includes(".") ? name.split(".").pop()?.toUpperCase() : null;
  return ext ? `${ext} file` : "File";
}
