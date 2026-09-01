import {
  buildFileApiUrl,
  getFileApiBaseUrl,
  signFileApiToken,
} from "@/lib/fileApiAuth";

async function fsFetch(
  method: string,
  pathWithQuery: string,
  init?: RequestInit & { json?: unknown },
): Promise<Response> {
  const pathOnly = pathWithQuery.split("?")[0];
  const { token } = signFileApiToken(method, pathOnly);
  const url = buildFileApiUrl(pathWithQuery, token);
  const headers = new Headers(init?.headers);
  headers.set("x-auth-token", token);
  let body = init?.body;
  if (init?.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(init.json);
  }
  return fetch(url, { ...init, method, headers, body, cache: "no-store" });
}

export async function fsList(relativePath: string) {
  const q = `?path=${encodeURIComponent(relativePath)}`;
  const res = await fsFetch("GET", `/fs/list${q}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "List failed");
  return json as {
    path: string;
    children: {
      name: string;
      relative_path: string;
      node_type: "file" | "folder";
      size_bytes: number | null;
      mtime: string;
    }[];
  };
}

export async function fsMkdir(relativePath: string) {
  const res = await fsFetch("POST", "/fs/mkdir", { json: { path: relativePath } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Mkdir failed");
  return json as { ok: true; relative_path: string };
}

export async function fsRename(from: string, toName: string) {
  const res = await fsFetch("POST", "/fs/rename", {
    json: { from, to_name: toName },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Rename failed");
  return json as { ok: true; relative_path: string };
}

export async function fsMove(from: string, toDir: string) {
  const res = await fsFetch("POST", "/fs/move", { json: { from, to_dir: toDir } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Move failed");
  return json as { ok: true; relative_path: string };
}

export async function fsCopy(from: string, toDir: string) {
  const res = await fsFetch("POST", "/fs/copy", { json: { from, to_dir: toDir } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Copy failed");
  return json as { ok: true; relative_path: string };
}

export async function fsTrash(relativePath: string) {
  const res = await fsFetch("POST", "/fs/trash", { json: { path: relativePath } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Trash failed");
  return json;
}

export async function fsRestore(relativePath: string) {
  const res = await fsFetch("POST", "/fs/restore", {
    json: { path: relativePath },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Restore failed");
  return json;
}

export async function fsPermanentDelete(relativePath: string) {
  const q = `?path=${encodeURIComponent(relativePath)}`;
  const res = await fsFetch("DELETE", `/fs/permanent${q}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Permanent delete failed");
  return json;
}

export async function fsStorageStatus() {
  const res = await fsFetch("GET", "/fs/storage-status");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Storage status failed");
  return json as {
    total_bytes: number;
    used_bytes: number;
    available_bytes: number;
    storage_root: string;
    checked_at: string;
  };
}

export function fsReadUrl(relativePath: string) {
  const { token } = signFileApiToken("GET", "/fs/read");
  return buildFileApiUrl(
    `/fs/read?path=${encodeURIComponent(relativePath)}`,
    token,
  );
}

export function fsThumbUrl(relativePath: string) {
  const { token } = signFileApiToken("GET", "/fs/thumbnail");
  return buildFileApiUrl(
    `/fs/thumbnail?path=${encodeURIComponent(relativePath)}`,
    token,
  );
}

/** Browser-direct upload session against Windows (HMAC path /fs/upload). */
export function getFsUploadBase() {
  return getFileApiBaseUrl();
}

export function signFsUploadToken() {
  return signFileApiToken("POST", "/fs/upload");
}

export function signFsUploadPutToken() {
  return signFileApiToken("PUT", "/fs/upload");
}
