-- Flatten fs_nodes: single tree under STORAGE_ROOT (no space_id).
-- Clean rebuild of fs metadata — truncate before reshape.

begin;

-- Drop dependent policies that reference space_id
drop policy if exists fs_nodes_select on fs_nodes;
drop policy if exists fs_nodes_write on fs_nodes;
drop policy if exists fs_node_tags_select on fs_node_tags;
drop policy if exists fs_node_tags_write on fs_node_tags;

truncate table fs_node_favorites, fs_node_tags, fs_nodes cascade;

-- Clear unlocks pointing at fs nodes
update folder_unlocks set fs_node_id = null where fs_node_id is not null;

alter table fs_nodes drop constraint if exists fs_nodes_space_id_relative_path_key;
alter table fs_nodes drop constraint if exists fs_nodes_relative_path_key;

drop index if exists fs_nodes_space_idx;

alter table fs_nodes drop column if exists space_id;

alter table fs_nodes add constraint fs_nodes_relative_path_key unique (relative_path);

create index if not exists fs_nodes_deleted_type_idx
  on fs_nodes (is_deleted, node_type);

-- Temporary open policies until 021 installs can_*_node — service role / next
-- will use admin client for sync; authenticated blocked until 021.
create policy fs_nodes_select on fs_nodes
  for select using (false);

create policy fs_nodes_write on fs_nodes
  for all using (false) with check (false);

create policy fs_node_tags_select on fs_node_tags
  for select using (false);

create policy fs_node_tags_write on fs_node_tags
  for all using (false) with check (false);

-- Replace space-scoped search RPC
drop function if exists search_fs_nodes_trgm(text, uuid);

create or replace function search_fs_nodes_trgm(q text)
returns setof fs_nodes
language sql
stable
security invoker
as $$
  select * from fs_nodes
  where is_deleted = false
    and (
      name % q
      or relative_path % q
      or coalesce(description, '') % q
      or coalesce(created_by, '') % q
      or coalesce(tags_text, '') % q
    )
  order by greatest(
    similarity(name, q),
    similarity(relative_path, q),
    similarity(coalesce(tags_text, ''), q)
  ) desc
  limit 40;
$$;

grant execute on function search_fs_nodes_trgm(text) to authenticated;

commit;
