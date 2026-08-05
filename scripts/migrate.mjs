#!/usr/bin/env node
/**
 * Apply pending SQL migrations in order, recording each in schema_migrations.
 * Usage:
 *   node scripts/migrate.mjs           # apply all pending
 *   node scripts/migrate.mjs --status  # list applied / pending
 *
 * Never re-applies recorded files. Backfills 001–009 as applied on first run
 * if the tracking table exists and those files are not yet recorded
 * (avoids re-running destructive 002).
 */
import { Client } from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

/** Pre-tracking migrations that already ran on live DBs — never re-execute. */
const LEGACY_BACKFILL = [
  "001_assets.sql",
  "002_auth_brands_folders.sql",
  "003_folder_passcodes.sql",
  "004_spaces_rename.sql",
  "005_tags.sql",
  "006_space_archive.sql",
  "007_favorites.sql",
  "008_favorites_admin_select.sql",
  "009_activity_log_space_fk.sql",
];

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

function createClient() {
  const ref = "oofgbedkmofmpeubagnk";
  const password = process.env.SUPABASE_DB_PASSWORD;
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl && !password) {
    console.error("Set SUPABASE_DB_PASSWORD or DATABASE_URL");
    process.exit(1);
  }

  return databaseUrl
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
}

function listMigrationFiles() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function ensureTrackingTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function getApplied(client) {
  const { rows } = await client.query(
    "select filename from schema_migrations order by filename",
  );
  return new Set(rows.map((r) => r.filename));
}

async function backfillLegacy(client, applied) {
  const toBackfill = LEGACY_BACKFILL.filter((f) => !applied.has(f));
  if (toBackfill.length === 0) return;

  // Only backfill if at least one post-legacy migration is missing OR
  // we detect the DB already has spaces (live DB) / assets table.
  const { rows } = await client.query(`
    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'spaces'
    ) as has_spaces;
  `);
  if (!rows[0]?.has_spaces) {
    // Fresh DB — apply legacy files normally via the pending loop.
    return;
  }

  for (const filename of toBackfill) {
    await client.query(
      "insert into schema_migrations (filename) values ($1) on conflict do nothing",
      [filename],
    );
    console.log("Backfilled (already applied):", filename);
    applied.add(filename);
  }
}

async function applyFile(client, filename) {
  const sqlPath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(sqlPath, "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query(
      "insert into schema_migrations (filename) values ($1) on conflict do nothing",
      [filename],
    );
    await client.query("commit");
    console.log("Applied:", filename);
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}

async function main() {
  loadEnvLocal();
  const statusOnly = process.argv.includes("--status");
  const client = createClient();
  await client.connect();

  try {
    await ensureTrackingTable(client);
    const applied = await getApplied(client);
    await backfillLegacy(client, applied);

    // Re-read after backfill
    const appliedNow = await getApplied(client);
    const files = listMigrationFiles();
    const pending = files.filter((f) => !appliedNow.has(f));

    if (statusOnly) {
      console.log("Applied:");
      for (const f of [...appliedNow].sort()) console.log("  ✓", f);
      console.log("Pending:");
      if (pending.length === 0) console.log("  (none)");
      else for (const f of pending) console.log("  ·", f);
      return;
    }

    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    for (const filename of pending) {
      await applyFile(client, filename);
    }
    console.log("Done. Applied", pending.length, "migration(s).");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
