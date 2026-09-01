-- Open Main Drive: any signed-in user has full view/download/edit (no folder ACL gates).
begin;

create or replace function can_view_node(p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;

create or replace function can_download_node(p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;

create or replace function can_edit_node(p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null;
$$;

drop policy if exists fs_nodes_select on fs_nodes;
create policy fs_nodes_select on fs_nodes
  for select using (auth.uid() is not null);

drop policy if exists fs_nodes_insert on fs_nodes;
create policy fs_nodes_insert on fs_nodes
  for insert with check (auth.uid() is not null);

drop policy if exists fs_nodes_update on fs_nodes;
create policy fs_nodes_update on fs_nodes
  for update using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists fs_nodes_delete on fs_nodes;
create policy fs_nodes_delete on fs_nodes
  for delete using (auth.uid() is not null);

drop policy if exists fs_node_tags_select on fs_node_tags;
create policy fs_node_tags_select on fs_node_tags
  for select using (auth.uid() is not null);

drop policy if exists fs_node_tags_write on fs_node_tags;
create policy fs_node_tags_write on fs_node_tags
  for all using (auth.uid() is not null)
  with check (auth.uid() is not null);

commit;
