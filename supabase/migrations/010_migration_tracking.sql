-- Migration tracking table (Phase 0)
-- Applied via migrate.mjs; after this file runs, it is recorded in schema_migrations.

create table if not exists schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);

grant select on schema_migrations to authenticated;
