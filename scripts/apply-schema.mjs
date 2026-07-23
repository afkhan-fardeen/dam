#!/usr/bin/env node
/**
 * Apply a migration SQL file using SUPABASE_DB_PASSWORD or DATABASE_URL.
 * Usage: node scripts/apply-schema.mjs [migration-file]
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
      process.env[m[1]] = m[2];
    }
  }
}

async function main() {
  loadEnvLocal();
  const fileArg = process.argv[2] || "002_auth_brands_folders.sql";
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
  console.log("Applied:", path.basename(sqlPath));
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
