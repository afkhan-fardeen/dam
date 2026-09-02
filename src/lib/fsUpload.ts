/** Resumable chunked upload to Windows /fs/upload via Next session binding. */

export type FsUploadOptions = {
  file: File;
  parentId: string | null;
  displayName?: string;
  tags?: string[];
  description?: string | null;
  createdBy?: string | null;
  onProgress?: (pct: number) => void;
};

export async function uploadFsFileWithProgress(
  options: FsUploadOptions,
): Promise<{ id: string; relative_path: string }> {
  const name =
    (options.displayName || options.file.name).trim() || options.file.name;
  const initRes = await fetch("/api/fs/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parent_id: options.parentId,
      name,
      size: options.file.size,
      mime_type: options.file.type || "application/octet-stream",
    }),
  });
  const initJson = await initRes.json();
  if (!initRes.ok) {
    throw new Error(initJson.error || "Could not start upload");
  }

  const sessionId = initJson.session_id as string;
  const chunkSize = Number(initJson.chunk_size || 8 * 1024 * 1024);
  const putToken = initJson.upload.put_token as string;
  const chunkUrl = initJson.upload.chunk_url as string;
  let offset = Number(initJson.offset || 0);

  while (offset < options.file.size) {
    const end = Math.min(offset + chunkSize, options.file.size);
    const blob = options.file.slice(offset, end);
    const buf = await blob.arrayBuffer();
    const res = await fetch(chunkUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-auth-token": putToken,
        "x-upload-session": sessionId,
        "upload-offset": String(offset),
      },
      body: buf,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 409 && typeof json.offset === "number") {
        offset = json.offset;
        continue;
      }
      throw new Error(json.error || "Chunk upload failed");
    }
    offset = Number(json.offset ?? end);
    options.onProgress?.(Math.min(99, (offset / options.file.size) * 100));
  }

  const completeRes = await fetch("/api/fs/upload", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parent_id: options.parentId,
      session_id: sessionId,
      name,
      mime_type: options.file.type || "application/octet-stream",
      tags: options.tags ?? [],
      description: options.description ?? null,
      created_by: options.createdBy ?? null,
    }),
  });
  const completeJson = await completeRes.json();
  if (!completeRes.ok) {
    throw new Error(completeJson.error || "Could not finalize upload");
  }
  options.onProgress?.(100);
  return {
    id: completeJson.node.id as string,
    relative_path: completeJson.node.relative_path as string,
  };
}
