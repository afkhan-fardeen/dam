export type DocPreviewKind = "csv" | "xlsx" | "docx" | "doc" | null;

const ROW_CAP = 100;

export function detectDocPreviewKind(
  mimeType: string | null | undefined,
  originalName: string | null | undefined,
): DocPreviewKind {
  const mime = (mimeType || "").toLowerCase();
  const name = (originalName || "").toLowerCase();
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";

  if (ext === ".doc") return "doc";
  if (
    mime === "application/msword" &&
    !name.endsWith(".docx") &&
    !mime.includes("openxml")
  ) {
    return "doc";
  }

  if (
    mime === "text/csv" ||
    mime === "application/csv" ||
    ext === ".csv"
  ) {
    return "csv";
  }

  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    ext === ".xlsx" ||
    ext === ".xls"
  ) {
    return "xlsx";
  }

  if (
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === ".docx"
  ) {
    return "docx";
  }

  return null;
}

export type PreviewTable = {
  headers: string[];
  rows: string[][];
  totalRows: number;
  capped: boolean;
};

export function capTable(
  headers: string[],
  rows: string[][],
  limit = ROW_CAP,
): PreviewTable {
  return {
    headers,
    rows: rows.slice(0, limit),
    totalRows: rows.length,
    capped: rows.length > limit,
  };
}

export async function parseCsvPreview(text: string): Promise<PreviewTable> {
  const Papa = (await import("papaparse")).default;
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  });
  if (result.errors.length > 0 && (!result.data || result.data.length === 0)) {
    throw new Error(result.errors[0]?.message || "Could not parse CSV");
  }
  const data = (result.data || []).filter((row) =>
    row.some((cell) => String(cell ?? "").trim() !== ""),
  );
  if (data.length === 0) {
    return { headers: [], rows: [], totalRows: 0, capped: false };
  }
  const headers = data[0].map((c, i) => String(c ?? `Column ${i + 1}`));
  const body = data.slice(1).map((row) =>
    headers.map((_, i) => String(row[i] ?? "")),
  );
  return capTable(headers, body);
}

export async function parseXlsxPreview(buffer: ArrayBuffer): Promise<PreviewTable> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [], totalRows: 0, capped: false };
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
    sheet,
    { header: 1, defval: "" },
  ) as (string | number | boolean | null)[][];

  const cleaned = rows.filter((row) =>
    row.some((cell) => String(cell ?? "").trim() !== ""),
  );
  if (cleaned.length === 0) {
    return { headers: [], rows: [], totalRows: 0, capped: false };
  }
  const headers = cleaned[0].map((c, i) => String(c ?? `Column ${i + 1}`));
  const body = cleaned.slice(1).map((row) =>
    headers.map((_, i) => String(row[i] ?? "")),
  );
  return capTable(headers, body);
}

export async function parseDocxPreview(buffer: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth");
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  return result.value || "<p>(Empty document)</p>";
}
