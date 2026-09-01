-- Additive FKs / search helpers for fs_nodes (plan-001)

begin;

-- Folder unlocks can target fs_nodes folders (parallel to folders)
alter table folder_unlocks
  add column if not exists fs_node_id uuid references fs_nodes(id) on delete cascade;

create index if not exists folder_unlocks_fs_node_idx
  on folder_unlocks (fs_node_id)
  where fs_node_id is not null;

-- Basic FTS over fs_nodes (repoint; keep asset RPCs for legacy until cutover)
create or replace function search_fs_nodes_trgm(
  q text,
  p_space_id uuid
)
returns setof fs_nodes
language sql
stable
security invoker
as $$
  select * from fs_nodes
  where is_deleted = false
    and space_id = p_space_id
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

grant execute on function search_fs_nodes_trgm(text, uuid) to authenticated;

commit;
