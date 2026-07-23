import { createHmac } from "crypto";

const TOKEN_TTL_MS = 300_000;

export function getFileApiBaseUrl(): string {
  const base = process.env.FILE_API_BASE_URL;
  if (!base) {
    throw new Error("FILE_API_BASE_URL is not set");
  }
  return base.replace(/\/$/, "");
}

function getFileApiKey(): string {
  const key = process.env.FILE_API_KEY;
  if (!key || key === "REPLACE_WITH_WINDOWS_API_KEY") {
    throw new Error("FILE_API_KEY is not set");
  }
  return key;
}

/**
 * Signs a short-lived token for the Windows file API.
 * Payload: `${METHOD}:${path}:${expiresAt}`
 * Token: `${expiresAt}.${hmacHex}`
 */
export function signFileApiToken(
  method: string,
  path: string,
): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const payload = `${method.toUpperCase()}:${normalizedPath}:${expiresAt}`;
  const hmacHex = createHmac("sha256", getFileApiKey())
    .update(payload)
    .digest("hex");
  return {
    token: `${expiresAt}.${hmacHex}`,
    expiresAt,
  };
}

export function buildFileApiUrl(
  path: string,
  token?: string,
): string {
  const base = getFileApiBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!token) {
    return `${base}${normalizedPath}`;
  }
  const sep = normalizedPath.includes("?") ? "&" : "?";
  return `${base}${normalizedPath}${sep}token=${encodeURIComponent(token)}`;
}
