#!/usr/bin/env node
/**
 * Bootstrap first admin user.
 * Usage: node scripts/bootstrap-admin.mjs email@example.com "Full Name" [password]
 *
 * Creates (or updates) the auth user, profile with is_admin=true,
 * and editor memberships on all spaces.
 */
import { createClient } from "@supabase/supabase-js";
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
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  loadEnvLocal();
  const email = process.argv[2];
  const fullName = process.argv[3] || "Admin";
  const password = process.argv[4] || "ChangeMeNow123!";

  if (!email) {
    console.error('Usage: node scripts/bootstrap-admin.mjs email "Full Name" [password]');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const dbPassword = process.env.SUPABASE_DB_PASSWORD;
  if (!url || !serviceKey || !dbPassword) {
    console.error("Missing env vars");
    process.exit(1);
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
  let user = listed?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    user = data.user;
    console.log("Created user", user.id);
  } else {
    await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    console.log("Updated existing user", user.id);
  }

  const ref = "oofgbedkmofmpeubagnk";
  const pg = new Client({
    host: `db.${ref}.supabase.co`,
    port: 5432,
    user: "postgres",
    password: dbPassword,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
  });
  await pg.connect();

  await pg.query(
    `insert into profiles (id, full_name, email, is_admin)
     values ($1, $2, $3, true)
     on conflict (id) do update set full_name = $2, email = $3, is_admin = true`,
    [user.id, fullName, email],
  );

  const spaces = await pg.query(`select id, slug from spaces`);
  for (const space of spaces.rows) {
    await pg.query(
      `insert into space_memberships (space_id, user_id, role)
       values ($1, $2, 'editor')
       on conflict (space_id, user_id) do update set role = 'editor'`,
      [space.id, user.id],
    );
    console.log("Membership:", space.slug, "editor");
  }

  await pg.end();
  console.log("Admin ready:", email, "password:", password);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
