-- Live filesystem mirror: fs_nodes (plan-001 §4.1)
-- Additive — does not drop assets/folders.

begin;

do $$ begin
  create type fs_node_type as enum ('file', 'folder');
exception
  when duplicate_object then null;
end $$;

create table if not exists fs_nodes (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references spaces(id) on delete cascade,
  parent_id uuid references fs_nodes(id) on delete cascade,
  node_type fs_node_type not null,
  name text not null,
  relative_path text not null,
  size_bytes bigint,
  mime_type text,
  content_hash text,
  description text,
  created_by text,
  uploaded_by uuid references profiles(id) on delete set null,
  has_thumbnail boolean not null default false,
  passcode_enabled boolean not null default false,
  passcode_hash text,
  tags_text text not null default '',
  last_synced_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (space_id, relative_path)
);

create index if not exists fs_nodes_parent_idx on fs_nodes (parent_id);
create index if not exists fs_nodes_space_idx on fs_nodes (space_id, is_deleted, node_type);
create index if not exists fs_nodes_updated_idx on fs_nodes (updated_at desc);

-- Requires pg_trgm (already used by asset search)
create index if not exists fs_nodes_path_trgm on fs_nodes using gin (relative_path gin_trgm_ops);
create index if not exists fs_nodes_name_trgm on fs_nodes using gin (name gin_trgm_ops);

alter table fs_nodes enable row level security;

drop policy if exists fs_nodes_select on fs_nodes;
create policy fs_nodes_select on fs_nodes
  for select using (public.can_view_space(space_id));

drop policy if exists fs_nodes_write on fs_nodes;
create policy fs_nodes_write on fs_nodes
  for all using (public.can_edit_space(space_id))
  with check (public.can_edit_space(space_id));

-- Service-role / admin sync also needs insert when memberships don't apply;
-- authenticated editors covered above; admins via can_edit_space (is_admin).

grant select, insert, update, delete on fs_nodes to authenticated;

-- Tag links for fs_nodes (parallel to asset_tags)
create table if not exists fs_node_tags (
  fs_node_id uuid not null references fs_nodes(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  primary key (fs_node_id, tag_id)
);

alter table fs_node_tags enable row level security;

drop policy if exists fs_node_tags_select on fs_node_tags;
create policy fs_node_tags_select on fs_node_tags
  for select using (
    exists (
      select 1 from fs_nodes n
      where n.id = fs_node_id and public.can_view_space(n.space_id)
    )
  );

drop policy if exists fs_node_tags_write on fs_node_tags;
create policy fs_node_tags_write on fs_node_tags
  for all using (
    exists (
      select 1 from fs_nodes n
      where n.id = fs_node_id and public.can_edit_space(n.space_id)
    )
  )
  with check (
    exists (
      select 1 from fs_nodes n
      where n.id = fs_node_id and public.can_edit_space(n.space_id)
    )
  );

grant select, insert, update, delete on fs_node_tags to authenticated;

-- Favorites for fs_nodes
create table if not exists fs_node_favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  fs_node_id uuid not null references fs_nodes(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, fs_node_id)
);

create index if not exists fs_node_favorites_user_idx
  on fs_node_favorites (user_id, created_at desc);

alter table fs_node_favorites enable row level security;

drop policy if exists fs_node_favorites_select on fs_node_favorites;
create policy fs_node_favorites_select on fs_node_favorites
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists fs_node_favorites_insert on fs_node_favorites;
create policy fs_node_favorites_insert on fs_node_favorites
  for insert with check (user_id = auth.uid());

drop policy if exists fs_node_favorites_delete on fs_node_favorites;
create policy fs_node_favorites_delete on fs_node_favorites
  for delete using (user_id = auth.uid());

grant select, insert, delete on fs_node_favorites to authenticated;

-- Sync tags_text when fs_node_tags change
create or replace function sync_fs_node_tags_text() returns trigger as $$
begin
  update fs_nodes set tags_text = coalesce((
    select string_agg(t.name, ' ' order by t.name)
    from tags t
    join fs_node_tags nt on nt.tag_id = t.id
    where nt.fs_node_id = coalesce(new.fs_node_id, old.fs_node_id)
  ), ''),
  updated_at = now()
  where id = coalesce(new.fs_node_id, old.fs_node_id);
  return coalesce(new, old);
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists fs_node_tags_sync on fs_node_tags;
create trigger fs_node_tags_sync
after insert or delete on fs_node_tags
for each row execute function sync_fs_node_tags_text();

-- Touch updated_at
create or replace function touch_fs_nodes_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists fs_nodes_touch on fs_nodes;
create trigger fs_nodes_touch
before update on fs_nodes
for each row execute function touch_fs_nodes_updated_at();

commit;
