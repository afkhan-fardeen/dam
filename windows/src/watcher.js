import chokidar from "chokidar";
import fsp from "fs/promises";
import path from "path";
import { toRelative, sha256File, pathExists } from "./paths.js";

/**
 * @param {{
 *   storageRoot: string,
 *   trashRoot: string,
 *   sync: { enqueue: Function, flush: Function },
 *   sweepIntervalMs: number,
 * }} opts
 */
export function startWatcher(opts) {
  const { storageRoot, trashRoot, sync, sweepIntervalMs } = opts;

  const watcher = chokidar.watch(storageRoot, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 100 },
    ignored: (p) => {
      const abs = path.resolve(p);
      const trash = path.resolve(trashRoot);
      return abs === trash || abs.startsWith(trash + path.sep);
    },
  });

  async function emit(type, absPath) {
    try {
      const relative_path = toRelative(storageRoot, absPath);
      let size_bytes = null;
      let content_hash = null;
      let node_type = "file";
      if (type !== "unlink" && type !== "unlinkDir") {
        const st = await fsp.stat(absPath).catch(() => null);
        if (!st) return;
        node_type = st.isDirectory() ? "folder" : "file";
        if (st.isFile()) {
          size_bytes = st.size;
          if (st.size < 50 * 1024 * 1024) {
            content_hash = await sha256File(absPath).catch(() => null);
          }
        }
      } else {
        node_type = type === "unlinkDir" ? "folder" : "file";
      }
      sync.enqueue({
        type,
        relative_path,
        node_type,
        name: path.basename(absPath),
        size_bytes,
        content_hash,
      });
    } catch (err) {
      console.warn("[watcher] emit failed", err?.message || err);
    }
  }

  watcher
    .on("add", (p) => void emit("add", p))
    .on("addDir", (p) => void emit("addDir", p))
    .on("change", (p) => void emit("change", p))
    .on("unlink", (p) => void emit("unlink", p))
    .on("unlinkDir", (p) => void emit("unlinkDir", p))
    .on("error", (err) => console.warn("[watcher]", err));

  async function walk(dir, out = []) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (path.resolve(abs).startsWith(path.resolve(trashRoot))) continue;
      const relative_path = toRelative(storageRoot, abs);
      if (ent.isDirectory()) {
        out.push({
          type: "present",
          relative_path,
          node_type: "folder",
          name: ent.name,
          size_bytes: null,
          content_hash: null,
        });
        await walk(abs, out);
      } else if (ent.isFile()) {
        const st = await fsp.stat(abs);
        let content_hash = null;
        if (st.size < 50 * 1024 * 1024) {
          content_hash = await sha256File(abs).catch(() => null);
        }
        out.push({
          type: "present",
          relative_path,
          node_type: "file",
          name: ent.name,
          size_bytes: st.size,
          content_hash,
        });
      }
    }
    return out;
  }

  async function sweep() {
    if (!(await pathExists(storageRoot))) return;
    try {
      const nodes = await walk(storageRoot);
      sync.enqueue({
        type: "sweep",
        relative_path: "",
        node_type: "folder",
        name: "",
        nodes,
      });
      await sync.flush();
      console.log(`[sweep] reported ${nodes.length} paths`);
    } catch (err) {
      console.warn("[sweep] failed", err?.message || err);
    }
  }

  const sweepTimer = setInterval(() => void sweep(), sweepIntervalMs);
  // Initial sweep shortly after boot
  setTimeout(() => void sweep(), 5000);

  return {
    close: async () => {
      clearInterval(sweepTimer);
      await watcher.close();
    },
    sweep,
  };
}
