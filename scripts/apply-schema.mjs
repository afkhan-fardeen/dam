#!/usr/bin/env node
/**
 * Apply a single migration SQL file (manual / emergency use).
 * Prefer: npm run db:schema  (scripts/migrate.mjs) which tracks applied files.
 *
 * Usage: node scripts/apply-schema.mjs <migration-file>
 */
import { Client } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  loadEnvLocal();
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error(
      "Usage: node scripts/apply-schema.mjs <migration-file>\nPrefer: npm run db:schema",
    );
    process.exit(1);
  }
  const sqlPath = path.isAbsolute(fileArg)
    ? fileArg
    : path.join(__dirname, "..", "supabase", "migrations", fileArg);
  const sql = fs.readFileSync(sqlPath, "utf8");
  const ref = "oofgbedkmofmpeubagnk";
  const password = process.env.SUPABASE_DB_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL;

  const client = databaseUrl
    ? new Client({
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false },
      })
    : new Client({
        host: `db.${ref}.supabase.co`,
        port: 5432,
        user: "postgres",
        password,
        database: "postgres",
        ssl: { rejectUnauthorized: false },
      });

  if (!databaseUrl && !password) {
    console.error("Set SUPABASE_DB_PASSWORD or DATABASE_URL");
    process.exit(1);
  }

  await client.connect();
  await client.query(sql);
  console.log("Applied (untracked):", path.basename(sqlPath));
  console.log("Tip: use npm run db:schema so schema_migrations is updated.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
