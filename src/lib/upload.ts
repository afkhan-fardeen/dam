/** Upload a file to the Windows API with XHR progress, then save metadata. */

export type UploadFileOptions = {
  file: File;
  spaceId: string;
  folderId: string | null;
  tags?: string[];
  description?: string | null;
  createdBy?: string | null;
  onProgress?: (pct: number) => void;
};

function xhrUpload(
  url: string,
  token: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown>; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("x-auth-token", token);
    xhr.setRequestHeader("ngrok-skip-browser-warning", "true");

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable || !onProgress) return;
      onProgress(Math.min(99, (e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      const text = xhr.responseText || "";
      let json: Record<string, unknown> = {};
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // non-JSON
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json, text });
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.onabort = () => reject(new Error("Upload aborted."));

    const formData = new FormData();
    formData.append("file", file);
    xhr.send(formData);
  });
}

export async function uploadFileWithProgress(
  options: UploadFileOptions,
): Promise<{ fileId: string; hasThumbnail: boolean; id?: string }> {
  const tokenRes = await fetch("/api/upload-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ space_id: options.spaceId }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(tokenJson.error || "Could not start the upload.");
  }

  const upload = await xhrUpload(
    tokenJson.uploadUrl as string,
    tokenJson.token as string,
    options.file,
    options.onProgress,
  );

  if (!upload.ok) {
    throw new Error(
      (upload.json.error as string) ||
        (upload.json.message as string) ||
        "Upload failed. Try again.",
    );
  }

  const fileId = String(
    upload.json.id ?? upload.json.file_id ?? upload.json.fileId ?? "",
  );
  if (!fileId) {
    throw new Error("Upload finished, but no file id came back.");
  }

  const hasThumbnail = Boolean(
    upload.json.has_thumbnail ??
      upload.json.hasThumbnail ??
      upload.json.thumbnailGenerated ??
      upload.json.thumbnail,
  );

  const metaRes = await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_id: fileId,
      original_name: options.file.name,
      mime_type: options.file.type || "application/octet-stream",
      size: options.file.size,
      space_id: options.spaceId,
      folder_id: options.folderId,
      description: options.description?.trim() || null,
      created_by: options.createdBy?.trim() || null,
      has_thumbnail: hasThumbnail,
      tags: options.tags ?? [],
    }),
  });
  const metaJson = await metaRes.json();
  if (!metaRes.ok) {
    throw new Error(
      metaJson.error || "File uploaded, but saving details failed.",
    );
  }

  options.onProgress?.(100);
  return {
    fileId,
    hasThumbnail,
    id: (metaJson.asset as { id?: string } | undefined)?.id as string | undefined,
  };
}
