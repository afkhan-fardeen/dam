-- Folder-level access control (architecture v1.3 §4.1a)

begin;

do $$ begin
  create type permission_level as enum ('view', 'download', 'edit');
exception
  when duplicate_object then null;
end $$;

create table if not exists access_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists access_group_members (
  group_id uuid not null references access_groups(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (group_id, user_id)
);

create table if not exists folder_permissions (
  id uuid primary key default gen_random_uuid(),
  fs_node_id uuid not null references fs_nodes(id) on delete cascade,
  principal_type text not null check (principal_type in ('user', 'group', 'everyone')),
  principal_id uuid,
  level permission_level not null,
  passcode_required boolean not null default false,
  created_at timestamptz not null default now(),
  unique (fs_node_id, principal_type, principal_id)
);

create index if not exists folder_permissions_node_idx
  on folder_permissions (fs_node_id);

create index if not exists access_group_members_user_idx
  on access_group_members (user_id);

-- Rank helper: view < download < edit
create or replace function permission_level_rank(p permission_level)
returns int
language sql
immutable
as $$
  select case p
    when 'view' then 1
    when 'download' then 2
    when 'edit' then 3
    else 0
  end;
$$;

-- Effective grant on a single folder (does not walk ancestors)
create or replace function node_has_grant(
  p_node_id uuid,
  p_user_id uuid,
  p_min permission_level
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from folder_permissions fp
    where fp.fs_node_id = p_node_id
      and permission_level_rank(fp.level) >= permission_level_rank(p_min)
      and (
        fp.principal_type = 'everyone'
        or (fp.principal_type = 'user' and fp.principal_id = p_user_id)
        or (
          fp.principal_type = 'group'
          and exists (
            select 1 from access_group_members m
            where m.group_id = fp.principal_id and m.user_id = p_user_id
          )
        )
      )
  );
$$;

-- Walk ancestors; stop at first folder that has any permission rows
create or replace function can_access_node(
  p_node_id uuid,
  p_min permission_level
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur uuid := p_node_id;
  parent uuid;
  has_rows boolean;
begin
  if uid is null then
    return false;
  end if;
  if public.is_admin() then
    return true;
  end if;

  while cur is not null loop
    select exists (
      select 1 from folder_permissions fp where fp.fs_node_id = cur
    ) into has_rows;

    if has_rows then
      return node_has_grant(cur, uid, p_min);
    end if;

    select parent_id into parent from fs_nodes where id = cur;
    cur := parent;
  end loop;

  -- No grants anywhere in the chain → default deny
  return false;
end;
$$;

create or replace function can_view_node(p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select can_access_node(p_node_id, 'view'::permission_level);
$$;

create or replace function can_download_node(p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select can_access_node(p_node_id, 'download'::permission_level);
$$;

create or replace function can_edit_node(p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select can_access_node(p_node_id, 'edit'::permission_level);
$$;

grant execute on function permission_level_rank(permission_level) to authenticated;
grant execute on function node_has_grant(uuid, uuid, permission_level) to authenticated;
grant execute on function can_access_node(uuid, permission_level) to authenticated;
grant execute on function can_view_node(uuid) to authenticated;
grant execute on function can_download_node(uuid) to authenticated;
grant execute on function can_edit_node(uuid) to authenticated;

-- RLS: fs_nodes
drop policy if exists fs_nodes_select on fs_nodes;
create policy fs_nodes_select on fs_nodes
  for select using (public.can_view_node(id));

drop policy if exists fs_nodes_write on fs_nodes;

drop policy if exists fs_nodes_insert on fs_nodes;
create policy fs_nodes_insert on fs_nodes
  for insert with check (
    public.is_admin()
    or parent_id is null
    or public.can_edit_node(parent_id)
  );

drop policy if exists fs_nodes_update on fs_nodes;
create policy fs_nodes_update on fs_nodes
  for update using (public.can_edit_node(id) or public.is_admin())
  with check (public.can_edit_node(id) or public.is_admin());

drop policy if exists fs_nodes_delete on fs_nodes;
create policy fs_nodes_delete on fs_nodes
  for delete using (public.can_edit_node(id) or public.is_admin());

drop policy if exists fs_node_tags_select on fs_node_tags;
create policy fs_node_tags_select on fs_node_tags
  for select using (public.can_view_node(fs_node_id));

drop policy if exists fs_node_tags_write on fs_node_tags;
create policy fs_node_tags_write on fs_node_tags
  for all using (public.can_edit_node(fs_node_id))
  with check (public.can_edit_node(fs_node_id));

-- access_groups: readable by authenticated, writable by admin
alter table access_groups enable row level security;
drop policy if exists access_groups_select on access_groups;
create policy access_groups_select on access_groups
  for select using (auth.uid() is not null);
drop policy if exists access_groups_write on access_groups;
create policy access_groups_write on access_groups
  for all using (public.is_admin()) with check (public.is_admin());

alter table access_group_members enable row level security;
drop policy if exists access_group_members_select on access_group_members;
create policy access_group_members_select on access_group_members
  for select using (auth.uid() is not null);
drop policy if exists access_group_members_write on access_group_members;
create policy access_group_members_write on access_group_members
  for all using (public.is_admin()) with check (public.is_admin());

alter table folder_permissions enable row level security;
drop policy if exists folder_permissions_select on folder_permissions;
create policy folder_permissions_select on folder_permissions
  for select using (
    public.is_admin() or public.can_view_node(fs_node_id)
  );
drop policy if exists folder_permissions_write on folder_permissions;
create policy folder_permissions_write on folder_permissions
  for all using (
    public.is_admin() or public.can_edit_node(fs_node_id)
  )
  with check (
    public.is_admin() or public.can_edit_node(fs_node_id)
  );

grant select, insert, update, delete on access_groups to authenticated;
grant select, insert, update, delete on access_group_members to authenticated;
grant select, insert, update, delete on folder_permissions to authenticated;

insert into access_groups (name)
values ('Everyone')
on conflict (name) do nothing;

commit;
