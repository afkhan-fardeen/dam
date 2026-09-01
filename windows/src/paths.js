import crypto from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";

/**
 * Resolve a relative path against root; throw if it escapes.
 * @param {string} root
 * @param {string} relative
 */
export function resolveSafe(root, relative = "") {
  const rootAbs = path.resolve(root);
  const cleaned = String(relative || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((p) => p && p !== "." && p !== "..")
    .join(path.sep);
  const abs = path.resolve(rootAbs, cleaned);
  const prefix = rootAbs.endsWith(path.sep) ? rootAbs : rootAbs + path.sep;
  if (abs !== rootAbs && !abs.startsWith(prefix)) {
    const err = new Error("Path escapes storage root");
    err.statusCode = 400;
    throw err;
  }
  return abs;
}

export function toRelative(root, absPath) {
  const rootAbs = path.resolve(root);
  const abs = path.resolve(absPath);
  const rel = path.relative(rootAbs, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    const err = new Error("Path outside root");
    err.statusCode = 400;
    throw err;
  }
  return rel.split(path.sep).join("/");
}

export function verifyHmacToken(apiKey, method, reqPath, token) {
  if (!token || !apiKey) return false;
  const [expiresAtStr, sig] = String(token).split(".");
  const expiresAt = Number(expiresAtStr);
  if (!expiresAt || !sig || Date.now() > expiresAt) return false;
  const normalized = reqPath.startsWith("/") ? reqPath : `/${reqPath}`;
  const payload = `${method.toUpperCase()}:${normalized}:${expiresAt}`;
  const expected = crypto
    .createHmac("sha256", apiKey)
    .update(payload)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, "utf8"),
      Buffer.from(expected, "utf8"),
    );
  } catch {
    return false;
  }
}

export async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

export async function pathExists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export async function movePath(src, dest) {
  await ensureDir(path.dirname(dest));
  try {
    await fsp.rename(src, dest);
  } catch (err) {
    if (err && err.code === "EXDEV") {
      await fsp.cp(src, dest, { recursive: true });
      await fsp.rm(src, { recursive: true, force: true });
      return;
    }
    throw err;
  }
}

export async function copyPath(src, dest) {
  await ensureDir(path.dirname(dest));
  await fsp.cp(src, dest, { recursive: true });
}
