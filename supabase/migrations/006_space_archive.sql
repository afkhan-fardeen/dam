-- Space archive status + space unlock sessions

alter table spaces
  add column if not exists status text not null default 'active';

do $$ begin
  alter table spaces
    add constraint spaces_status_check check (status in ('active', 'archived'));
exception
  when duplicate_object then null;
end $$;

create index if not exists spaces_status_idx on spaces (status);

create table if not exists space_unlocks (
  user_id uuid references profiles(id) on delete cascade not null,
  space_id uuid references spaces(id) on delete cascade not null,
  unlocked_until timestamptz not null,
  primary key (user_id, space_id)
);

create index if not exists space_unlocks_until_idx on space_unlocks (unlocked_until);

alter table space_unlocks enable row level security;

drop policy if exists "space_unlocks_select_own" on space_unlocks;
create policy "space_unlocks_select_own" on space_unlocks
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "space_unlocks_insert_own" on space_unlocks;
create policy "space_unlocks_insert_own" on space_unlocks
  for insert with check (user_id = auth.uid());

drop policy if exists "space_unlocks_update_own" on space_unlocks;
create policy "space_unlocks_update_own" on space_unlocks
  for update using (user_id = auth.uid());

drop policy if exists "space_unlocks_delete_own" on space_unlocks;
create policy "space_unlocks_delete_own" on space_unlocks
  for delete using (user_id = auth.uid() or public.is_admin());

grant select, insert, update, delete on space_unlocks to authenticated;
