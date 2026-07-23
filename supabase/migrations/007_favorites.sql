-- Per-user starred/favorite assets

create table if not exists asset_favorites (
  user_id uuid references profiles(id) on delete cascade not null,
  asset_id uuid references assets(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (user_id, asset_id)
);

create index if not exists asset_favorites_user_idx on asset_favorites (user_id, created_at desc);

alter table asset_favorites enable row level security;

drop policy if exists "favorites_select_own" on asset_favorites;
create policy "favorites_select_own" on asset_favorites
  for select using (user_id = auth.uid());

drop policy if exists "favorites_insert_own" on asset_favorites;
create policy "favorites_insert_own" on asset_favorites
  for insert with check (user_id = auth.uid());

drop policy if exists "favorites_delete_own" on asset_favorites;
create policy "favorites_delete_own" on asset_favorites
  for delete using (user_id = auth.uid());

grant select, insert, delete on asset_favorites to authenticated;
