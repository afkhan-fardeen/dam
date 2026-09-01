import {
  ensureDir,
  pathExists,
  resolveSafe,
  toRelative,
  verifyHmacToken,
  movePath,
  copyPath,
  sha256File,
} from "./paths.js";

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{ apiKey: string }} opts
 */
export function registerAuth(app, opts) {
  app.addHook("onRequest", async (request, reply) => {
    const urlPath = request.url.split("?")[0];
    if (urlPath === "/health") return;

    const token =
      request.headers["x-auth-token"] ||
      request.headers["x-auth-token".toLowerCase()] ||
      (typeof request.query?.token === "string" ? request.query.token : null);

    // tus may send token on Authorization or query
    const authHeader = request.headers.authorization;
    const bearer =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : null;
    const effective = token || bearer;

    // Map tus upload URLs to a stable HMAC path
    let hmacPath = urlPath;
    if (urlPath.startsWith("/fs/upload")) {
      hmacPath = "/fs/upload";
    }

    if (!verifyHmacToken(opts.apiKey, request.method, hmacPath, effective)) {
      return reply.code(401).send({ error: "Invalid or missing auth token" });
    }
  });
}

export {
  ensureDir,
  pathExists,
  resolveSafe,
  toRelative,
  movePath,
  copyPath,
  sha256File,
};
