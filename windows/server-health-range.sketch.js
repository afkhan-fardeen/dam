/**
 * Sketch of Windows file API handlers for /health and ranged /asset/:id.
 * Copy into the PC's server.js (or merge with the existing Fastify app).
 * See windows-file-api.md for context.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ files: string }} DIRS
 * @param {(id: string) => Promise<string | null>} findFileById
 */
function registerHealthAndRange(fastify, DIRS, findFileById) {
  fastify.get("/health", async () => ({ ok: true }));

  fastify.get("/asset/:id", async (request, reply) => {
    const match = await findFileById(request.params.id);
    if (!match) return reply.code(404).send({ error: "Asset not found" });
    const filePath = path.join(DIRS.files, match);
    const { size } = await fsp.stat(filePath);
    const range = request.headers.range;

    if (range) {
      const [startStr, endStr] = String(range).replace("bytes=", "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : size - 1;
      reply.code(206);
      reply.header("Content-Range", `bytes ${start}-${end}/${size}`);
      reply.header("Accept-Ranges", "bytes");
      reply.header("Content-Length", end - start + 1);
      return reply.send(fs.createReadStream(filePath, { start, end }));
    }

    reply.header("Content-Length", size);
    reply.header("Accept-Ranges", "bytes");
    return reply.send(fs.createReadStream(filePath));
  });
}

module.exports = { registerHealthAndRange };
