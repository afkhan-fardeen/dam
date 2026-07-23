-- Folder passcodes + per-user unlock sessions (8h TTL enforced in app)

alter table folders
  add column if not exists passcode_hash text,
  add column if not exists passcode_enabled boolean not null default false;

create table if not exists folder_unlocks (
  user_id uuid references profiles(id) on delete cascade not null,
  folder_id uuid references folders(id) on delete cascade not null,
  unlocked_until timestamptz not null,
  primary key (user_id, folder_id)
);

create index if not exists folder_unlocks_until_idx on folder_unlocks (unlocked_until);

alter table folder_unlocks enable row level security;

drop policy if exists "unlocks_select_own" on folder_unlocks;
create policy "unlocks_select_own" on folder_unlocks
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "unlocks_insert_own" on folder_unlocks;
create policy "unlocks_insert_own" on folder_unlocks
  for insert with check (user_id = auth.uid());

drop policy if exists "unlocks_update_own" on folder_unlocks;
create policy "unlocks_update_own" on folder_unlocks
  for update using (user_id = auth.uid());

drop policy if exists "unlocks_delete_own" on folder_unlocks;
create policy "unlocks_delete_own" on folder_unlocks
  for delete using (user_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on folder_unlocks to authenticated;

-- Never expose passcode_hash via default grants to anon; authenticated can select
-- folder rows but app must not select passcode_hash in client queries.
-- Editors can update passcode columns via existing folders_update_editor policy.
