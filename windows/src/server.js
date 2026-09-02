import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import crypto from "crypto";
import checkDiskSpace from "check-disk-space";
import { fileTypeFromFile } from "file-type";
import mime from "mime-types";
import sharp from "sharp";
import { registerAuth } from "./auth.js";
import {
  ensureDir,
  pathExists,
  resolveSafe,
  toRelative,
  movePath,
  uniqueDestPath,
  copyPath,
  sha256File,
} from "./paths.js";
import { createSyncClient } from "./syncClient.js";
import { startWatcher } from "./watcher.js";

const STORAGE_ROOT = process.env.STORAGE_ROOT || "C:\\Assets";
const TRASH_ROOT =
  process.env.TRASH_ROOT ||
  path.join(path.dirname(STORAGE_ROOT), path.basename(STORAGE_ROOT) + "-Trash");
const THUMB_CACHE =
  process.env.THUMB_CACHE ||
  path.join(path.dirname(STORAGE_ROOT), path.basename(STORAGE_ROOT) + "-ThumbCache");
const UPLOAD_SCRATCH =
  process.env.UPLOAD_SCRATCH ||
  path.join(path.dirname(STORAGE_ROOT), path.basename(STORAGE_ROOT) + "-UploadScratch");
const FILE_API_KEY = process.env.FILE_API_KEY || "";
const SYNC_SERVICE_KEY = process.env.SYNC_SERVICE_KEY || "";
const NEXT_SYNC_URL = process.env.NEXT_SYNC_URL || "";
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const SWEEP_INTERVAL_MS = Number(process.env.SWEEP_INTERVAL_MS || 300_000);

/** @type {Map<string, { targetPath: string, totalSize: number, received: number, userId: string, partFile: string, createdAt: number }>} */
const uploadSessions = new Map();

async function bootstrapDirs() {
  await ensureDir(STORAGE_ROOT);
  await ensureDir(TRASH_ROOT);
  await ensureDir(THUMB_CACHE);
  await ensureDir(UPLOAD_SCRATCH);
}

function relQuery(request) {
  return String(request.query?.path || request.body?.path || "");
}

async function makeThumbnail(absFile, relativePath) {
  try {
    const type = await fileTypeFromFile(absFile);
    if (!type || !type.mime.startsWith("image/")) return false;
    const key = crypto.createHash("sha1").update(relativePath).digest("hex");
    const out = path.join(THUMB_CACHE, `${key}.jpg`);
    await sharp(absFile)
      .rotate()
      .resize(480, 480, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(out);
    return true;
  } catch {
    return false;
  }
}

async function writeTrashSidecar(trashAbs, meta) {
  const side = trashAbs + ".trash.json";
  await fsp.writeFile(side, JSON.stringify(meta, null, 2), "utf8");
}

const app = Fastify({
  logger: true,
  bodyLimit: 32 * 1024 * 1024,
});

// Binary chunk uploads must not be JSON-parsed
app.addContentTypeParser(
  "application/octet-stream",
  { parseAs: "buffer" },
  (_req, body, done) => {
    done(null, body);
  },
);

await bootstrapDirs();
await app.register(cors, { origin: true });

registerAuth(app, { apiKey: FILE_API_KEY });

const sync = createSyncClient({
  nextSyncUrl: NEXT_SYNC_URL,
  syncServiceKey: SYNC_SERVICE_KEY,
});

const watcherCtl = startWatcher({
  storageRoot: STORAGE_ROOT,
  trashRoot: TRASH_ROOT,
  sync,
  sweepIntervalMs: SWEEP_INTERVAL_MS,
});

app.get("/health", async () => ({
  ok: true,
  storage_root: STORAGE_ROOT,
  trash_root: TRASH_ROOT,
}));

app.get("/fs/storage-status", async () => {
  const disk = await checkDiskSpace(STORAGE_ROOT);
  return {
    total_bytes: disk.size,
    used_bytes: disk.size - disk.free,
    available_bytes: disk.free,
    storage_root: STORAGE_ROOT,
    checked_at: new Date().toISOString(),
  };
});

app.get("/fs/list", async (request, reply) => {
  const relative = relQuery(request);
  const abs = resolveSafe(STORAGE_ROOT, relative);
  if (!(await pathExists(abs))) {
    return reply.code(404).send({ error: "Not found" });
  }
  const st = await fsp.stat(abs);
  if (!st.isDirectory()) {
    return reply.code(400).send({ error: "Not a directory" });
  }
  const entries = await fsp.readdir(abs, { withFileTypes: true });
  const children = [];
  for (const ent of entries) {
    const childAbs = path.join(abs, ent.name);
    const childRel = toRelative(STORAGE_ROOT, childAbs);
    const cst = await fsp.stat(childAbs);
    children.push({
      name: ent.name,
      relative_path: childRel,
      node_type: ent.isDirectory() ? "folder" : "file",
      size_bytes: ent.isFile() ? cst.size : null,
      mtime: cst.mtime.toISOString(),
    });
  }
  return { path: relative.replace(/\\/g, "/"), children };
});

app.post("/fs/mkdir", async (request, reply) => {
  const body = request.body || {};
  const relative = String(body.path || "");
  if (!relative) return reply.code(400).send({ error: "path required" });
  const abs = resolveSafe(STORAGE_ROOT, relative);
  if (await pathExists(abs)) {
    return reply.code(409).send({ error: "Already exists" });
  }
  await ensureDir(abs);
  sync.enqueue({
    type: "addDir",
    relative_path: toRelative(STORAGE_ROOT, abs),
    node_type: "folder",
    name: path.basename(abs),
  });
  return { ok: true, relative_path: toRelative(STORAGE_ROOT, abs) };
});

app.post("/fs/rename", async (request, reply) => {
  const body = request.body || {};
  const from = String(body.from || "");
  const toName = String(body.to_name || body.name || "").trim();
  if (!from || !toName) {
    return reply.code(400).send({ error: "from and to_name required" });
  }
  if (toName.includes("/") || toName.includes("\\") || toName.includes("..")) {
    return reply.code(400).send({ error: "Invalid name" });
  }
  const src = resolveSafe(STORAGE_ROOT, from);
  if (!(await pathExists(src))) return reply.code(404).send({ error: "Not found" });
  const destRel = path.posix.join(path.posix.dirname(from.replace(/\\/g, "/")), toName);
  const dest = resolveSafe(STORAGE_ROOT, destRel);
  if (await pathExists(dest)) return reply.code(409).send({ error: "Target exists" });
  await movePath(src, dest);
  return {
    ok: true,
    from,
    relative_path: toRelative(STORAGE_ROOT, dest),
  };
});

app.post("/fs/move", async (request, reply) => {
  const body = request.body || {};
  const from = String(body.from || "");
  const toDir = String(body.to_dir || body.to || "");
  if (!from) return reply.code(400).send({ error: "from required" });
  const src = resolveSafe(STORAGE_ROOT, from);
  if (!(await pathExists(src))) return reply.code(404).send({ error: "Not found" });
  const name = path.basename(src);
  const destRel = toDir
    ? path.posix.join(toDir.replace(/\\/g, "/").replace(/\/+$/, ""), name)
    : name;
  const dest = resolveSafe(STORAGE_ROOT, destRel);
  if (await pathExists(dest)) return reply.code(409).send({ error: "Target exists" });
  await movePath(src, dest);
  return { ok: true, relative_path: toRelative(STORAGE_ROOT, dest) };
});

app.post("/fs/copy", async (request, reply) => {
  const body = request.body || {};
  const from = String(body.from || "");
  const toDir = String(body.to_dir || body.to || "");
  if (!from) return reply.code(400).send({ error: "from required" });
  const src = resolveSafe(STORAGE_ROOT, from);
  if (!(await pathExists(src))) return reply.code(404).send({ error: "Not found" });
  const name = path.basename(src);
  const destRel = toDir
    ? path.posix.join(toDir.replace(/\\/g, "/").replace(/\/+$/, ""), name)
    : `${name}-copy`;
  const dest = resolveSafe(STORAGE_ROOT, destRel);
  if (await pathExists(dest)) return reply.code(409).send({ error: "Target exists" });
  await copyPath(src, dest);
  return { ok: true, relative_path: toRelative(STORAGE_ROOT, dest) };
});

app.post("/fs/trash", async (request, reply) => {
  try {
    const body = request.body || {};
    const relative = String(body.path || "");
    if (!relative) {
      return reply.code(400).send({ error: "path required", code: "BAD_REQUEST" });
    }
    const src = resolveSafe(STORAGE_ROOT, relative);
    if (!(await pathExists(src))) {
      return reply.code(404).send({ error: "Not found", code: "NOT_FOUND" });
    }
    const dest = resolveSafe(TRASH_ROOT, relative);
    // Same relative path may already sit in trash (re-delete or leftover). Clear it
    // so restore/permanent-delete keep using the stable original relative_path.
    if (await pathExists(dest)) {
      await fsp.rm(dest, { recursive: true, force: true });
      await fsp.rm(dest + ".trash.json", { force: true }).catch(() => null);
    }
    await movePath(src, dest);
    await writeTrashSidecar(dest, {
      original_path: relative.replace(/\\/g, "/"),
      trashed_at: new Date().toISOString(),
    });
    return { ok: true, trash_path: toRelative(TRASH_ROOT, dest) };
  } catch (err) {
    // Last-resort unique dest if overwrite race still hits EEXIST
    if (err?.code === "EEXIST") {
      try {
        const body = request.body || {};
        const relative = String(body.path || "");
        const src = resolveSafe(STORAGE_ROOT, relative);
        const preferred = resolveSafe(TRASH_ROOT, relative);
        const dest = await uniqueDestPath(preferred);
        await movePath(src, dest);
        await writeTrashSidecar(dest, {
          original_path: relative.replace(/\\/g, "/"),
          trashed_at: new Date().toISOString(),
        });
        return { ok: true, trash_path: toRelative(TRASH_ROOT, dest) };
      } catch (err2) {
        return reply.code(err2?.statusCode || 500).send({
          error: err2?.message || "Trash failed",
          code: err2?.code || "TRASH_FAILED",
        });
      }
    }
    const status = err?.statusCode || 500;
    return reply.code(status).send({
      error: err?.message || "Trash failed",
      code: err?.code || "TRASH_FAILED",
    });
  }
});

app.post("/fs/restore", async (request, reply) => {
  const body = request.body || {};
  const relative = String(body.path || body.original_path || "");
  if (!relative) return reply.code(400).send({ error: "path required" });
  const src = resolveSafe(TRASH_ROOT, relative);
  if (!(await pathExists(src))) return reply.code(404).send({ error: "Not in trash" });
  const dest = resolveSafe(STORAGE_ROOT, relative);
  if (await pathExists(dest)) return reply.code(409).send({ error: "Live path exists" });
  await movePath(src, dest);
  await fsp.rm(src + ".trash.json", { force: true }).catch(() => null);
  return { ok: true, relative_path: toRelative(STORAGE_ROOT, dest) };
});

app.delete("/fs/permanent", async (request, reply) => {
  const relative = String(request.query?.path || request.body?.path || "");
  if (!relative) return reply.code(400).send({ error: "path required" });
  // Only allow permanent delete inside trash
  const abs = resolveSafe(TRASH_ROOT, relative);
  if (!(await pathExists(abs))) return reply.code(404).send({ error: "Not found in trash" });
  await fsp.rm(abs, { recursive: true, force: true });
  await fsp.rm(abs + ".trash.json", { force: true }).catch(() => null);
  return { ok: true };
});

app.get("/fs/read", async (request, reply) => {
  const relative = relQuery(request);
  const abs = resolveSafe(STORAGE_ROOT, relative);
  if (!(await pathExists(abs))) return reply.code(404).send({ error: "Not found" });
  const st = await fsp.stat(abs);
  if (!st.isFile()) return reply.code(400).send({ error: "Not a file" });
  const type = (await fileTypeFromFile(abs))?.mime || mime.lookup(abs) || "application/octet-stream";
  const range = request.headers.range;
  reply.header("Content-Type", type);
  reply.header("Accept-Ranges", "bytes");
  if (range) {
    const [startStr, endStr] = String(range).replace("bytes=", "").split("-");
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : st.size - 1;
    reply.code(206);
    reply.header("Content-Range", `bytes ${start}-${end}/${st.size}`);
    reply.header("Content-Length", end - start + 1);
    return reply.send(fs.createReadStream(abs, { start, end }));
  }
  reply.header("Content-Length", st.size);
  return reply.send(fs.createReadStream(abs));
});

app.get("/fs/thumbnail", async (request, reply) => {
  const relative = relQuery(request);
  const key = crypto.createHash("sha1").update(relative.replace(/\\/g, "/")).digest("hex");
  const cached = path.join(THUMB_CACHE, `${key}.jpg`);
  if (!(await pathExists(cached))) {
    const abs = resolveSafe(STORAGE_ROOT, relative);
    if (!(await pathExists(abs))) return reply.code(404).send({ error: "Not found" });
    const ok = await makeThumbnail(abs, relative.replace(/\\/g, "/"));
    if (!ok || !(await pathExists(cached))) {
      return reply.code(404).send({ error: "No thumbnail" });
    }
  }
  reply.header("Content-Type", "image/jpeg");
  reply.header("Cache-Control", "private, max-age=3600");
  return reply.send(fs.createReadStream(cached));
});

/** Resumable upload (plan §8.1) — tus-compatible session model */
app.post("/fs/upload/init", async (request, reply) => {
  const body = request.body || {};
  const targetPath = String(body.path || "").replace(/\\/g, "/").replace(/^\/+/, "");
  const totalSize = Number(body.size || 0);
  const userId = String(body.user_id || "");
  if (!targetPath || !totalSize || totalSize < 0) {
    return reply.code(400).send({ error: "path and size required" });
  }
  // Session bound to user + path
  const sessionId = crypto.randomUUID();
  const partFile = path.join(UPLOAD_SCRATCH, `${sessionId}.part`);
  await ensureDir(UPLOAD_SCRATCH);
  await fsp.writeFile(partFile, Buffer.alloc(0));
  uploadSessions.set(sessionId, {
    targetPath,
    totalSize,
    received: 0,
    userId,
    partFile,
    createdAt: Date.now(),
  });
  return {
    session_id: sessionId,
    offset: 0,
    chunk_size: Number(body.chunk_size || 8 * 1024 * 1024),
  };
});

app.put("/fs/upload/chunk", async (request, reply) => {
  const sessionId = String(
    request.headers["x-upload-session"] || request.query?.session_id || "",
  );
  const session = uploadSessions.get(sessionId);
  if (!session) return reply.code(404).send({ error: "Unknown session" });
  const offset = Number(request.headers["upload-offset"] || request.query?.offset || 0);
  if (offset !== session.received) {
    return reply.code(409).send({
      error: "Offset mismatch",
      offset: session.received,
    });
  }

  let buf;
  if (Buffer.isBuffer(request.body)) {
    buf = request.body;
  } else {
    const chunks = [];
    for await (const chunk of request.raw) {
      chunks.push(chunk);
    }
    buf = Buffer.concat(chunks);
  }
  await fsp.appendFile(session.partFile, buf);
  session.received += buf.length;
  return { ok: true, offset: session.received };
});

app.post("/fs/upload/complete", async (request, reply) => {
  const body = request.body || {};
  const sessionId = String(body.session_id || "");
  const session = uploadSessions.get(sessionId);
  if (!session) return reply.code(404).send({ error: "Unknown session" });

  const caller = String(body.user_id || "");
  if (session.userId && caller && session.userId !== caller) {
    return reply.code(403).send({ error: "Upload session belongs to another user" });
  }

  if (session.received !== session.totalSize) {
    return reply.code(400).send({
      error: "Incomplete upload",
      received: session.received,
      expected: session.totalSize,
    });
  }

  // MIME / magic-byte validation before becoming visible
  const detected = await fileTypeFromFile(session.partFile).catch(() => null);
  const declared = String(body.mime_type || "");
  // Allow unknown types (FS5) but reject empty payloads
  const st = await fsp.stat(session.partFile);
  if (st.size === 0) {
    await fsp.rm(session.partFile, { force: true });
    uploadSessions.delete(sessionId);
    return reply.code(400).send({ error: "Empty file rejected" });
  }

  const dest = resolveSafe(STORAGE_ROOT, session.targetPath);
  if (await pathExists(dest)) {
    await fsp.rm(session.partFile, { force: true });
    uploadSessions.delete(sessionId);
    return reply.code(409).send({ error: "Target already exists" });
  }
  await movePath(session.partFile, dest);
  uploadSessions.delete(sessionId);

  const relative_path = toRelative(STORAGE_ROOT, dest);
  const content_hash = await sha256File(dest).catch(() => null);
  const has_thumbnail = await makeThumbnail(dest, relative_path);

  sync.enqueue({
    type: "add",
    relative_path,
    node_type: "file",
    name: path.basename(dest),
    size_bytes: st.size,
    content_hash,
    mime_type: detected?.mime || declared || mime.lookup(dest) || "application/octet-stream",
    has_thumbnail,
    user_id: session.userId || null,
  });
  await sync.flush();

  return {
    ok: true,
    relative_path,
    size_bytes: st.size,
    content_hash,
    mime_type: detected?.mime || declared || null,
    has_thumbnail,
  };
});

app.delete("/fs/upload/:sessionId", async (request, reply) => {
  const sessionId = request.params.sessionId;
  const session = uploadSessions.get(sessionId);
  if (!session) return reply.code(404).send({ error: "Unknown session" });
  await fsp.rm(session.partFile, { force: true });
  uploadSessions.delete(sessionId);
  return { ok: true };
});

// Legacy compatibility stubs (return clear errors during cutover)
app.post("/upload", async (_req, reply) => {
  return reply.code(410).send({
    error: "Deprecated. Use /fs/upload/init + chunk + complete.",
  });
});

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`DAM FS service on ${HOST}:${PORT}`);
  console.log(`STORAGE_ROOT=${STORAGE_ROOT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

async function shutdown() {
  await watcherCtl.close();
  await app.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
