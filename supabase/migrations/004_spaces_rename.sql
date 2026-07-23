-- DAM: brands → spaces rename + space passcode/kind + profiles.is_active
-- Order matters: drop policies that depend on brand_* helpers before dropping those helpers.

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

alter table profiles
  add column if not exists is_active boolean not null default true;

-- ---------------------------------------------------------------------------
-- Drop RLS policies that depend on brand_* helpers (before rename)
-- ---------------------------------------------------------------------------

drop policy if exists "brands_select_member_or_admin" on brands;
drop policy if exists "brands_insert_admin" on brands;
drop policy if exists "brands_update_admin" on brands;
drop policy if exists "brands_delete_admin" on brands;

drop policy if exists "memberships_select_own_or_admin" on brand_memberships;
drop policy if exists "memberships_write_admin" on brand_memberships;

drop policy if exists "folders_select_member" on folders;
drop policy if exists "folders_insert_editor" on folders;
drop policy if exists "folders_update_editor" on folders;
drop policy if exists "folders_delete_editor" on folders;

drop policy if exists "assets_select_member" on assets;
drop policy if exists "assets_insert_editor" on assets;
drop policy if exists "assets_update_editor" on assets;
drop policy if exists "assets_delete_editor" on assets;

-- ---------------------------------------------------------------------------
-- Drop brand helpers + search RPCs (policies no longer depend on them)
-- ---------------------------------------------------------------------------

drop function if exists public.brand_role(uuid);
drop function if exists public.can_view_brand(uuid);
drop function if exists public.can_edit_brand(uuid);
drop function if exists public.can_download_brand(uuid);
drop function if exists search_assets_trgm(text, uuid, text);
drop function if exists search_assets_fts(text, uuid, text);

-- ---------------------------------------------------------------------------
-- Rename enum brand_role → space_role
-- ---------------------------------------------------------------------------

do $$ begin
  create type space_role as enum ('viewer', 'downloader', 'editor');
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Rename brands → spaces (+ new columns)
-- ---------------------------------------------------------------------------

alter table if exists brands rename to spaces;

alter table spaces
  add column if not exists kind text not null default 'brand',
  add column if not exists requires_passcode boolean not null default false,
  add column if not exists passcode_hash text;

do $$ begin
  alter table spaces
    add constraint spaces_kind_check check (kind in ('brand', 'department'));
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Rename brand_memberships → space_memberships
-- ---------------------------------------------------------------------------

alter table if exists brand_memberships rename to space_memberships;

alter table space_memberships rename column brand_id to space_id;

alter table space_memberships
  alter column role type space_role
  using role::text::space_role;

-- ---------------------------------------------------------------------------
-- Rename brand_id → space_id on related tables
-- ---------------------------------------------------------------------------

alter table folders rename column brand_id to space_id;
alter table assets rename column brand_id to space_id;
alter table activity_log rename column brand_id to space_id;

alter index if exists folders_brand_parent_idx rename to folders_space_parent_idx;
alter index if exists brand_memberships_user_idx rename to space_memberships_user_idx;
alter index if exists activity_log_brand_idx rename to activity_log_space_idx;
alter index if exists assets_brand_folder_idx rename to assets_space_folder_idx;

-- ---------------------------------------------------------------------------
-- Space helpers
-- ---------------------------------------------------------------------------

create or replace function public.space_role(p_space_id uuid)
returns space_role
language sql
stable
security definer
set search_path = public
as $$
  select role from space_memberships
  where space_id = p_space_id and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_view_space(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from space_memberships
      where space_id = p_space_id and user_id = auth.uid()
    );
$$;

create or replace function public.can_edit_space(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from space_memberships
      where space_id = p_space_id
        and user_id = auth.uid()
        and role = 'editor'
    );
$$;

create or replace function public.can_download_space(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from space_memberships
      where space_id = p_space_id
        and user_id = auth.uid()
        and role in ('downloader', 'editor')
    );
$$;

-- ---------------------------------------------------------------------------
-- Search RPCs (space_id scoped)
-- ---------------------------------------------------------------------------

create or replace function search_assets_trgm(
  q text,
  p_space_id uuid,
  category_filter text default null
)
returns setof assets
language sql
stable
security invoker
as $$
  select * from assets
  where status = 'active'
    and space_id = p_space_id
    and (created_by % q or description % q or original_name % q)
    and (category_filter is null or category = category_filter)
  order by greatest(
    similarity(coalesce(created_by, ''), q),
    similarity(coalesce(description, ''), q),
    similarity(coalesce(original_name, ''), q)
  ) desc
  limit 40;
$$;

create or replace function search_assets_fts(
  q text,
  p_space_id uuid,
  category_filter text default null
)
returns setof assets
language sql
stable
security invoker
as $$
  select *
  from assets
  where status = 'active'
    and space_id = p_space_id
    and search_vector @@ websearch_to_tsquery('english', q)
    and (category_filter is null or category = category_filter)
  order by ts_rank(search_vector, websearch_to_tsquery('english', q)) desc
  limit 40;
$$;

-- ---------------------------------------------------------------------------
-- RLS policies on renamed tables
-- ---------------------------------------------------------------------------

drop policy if exists "spaces_select_member_or_admin" on spaces;
create policy "spaces_select_member_or_admin" on spaces
  for select using (public.can_view_space(id));

drop policy if exists "spaces_insert_admin" on spaces;
create policy "spaces_insert_admin" on spaces
  for insert with check (public.is_admin());

drop policy if exists "spaces_update_admin" on spaces;
create policy "spaces_update_admin" on spaces
  for update using (public.is_admin());

drop policy if exists "spaces_delete_admin" on spaces;
create policy "spaces_delete_admin" on spaces
  for delete using (public.is_admin());

drop policy if exists "memberships_select_own_or_admin" on space_memberships;
create policy "memberships_select_own_or_admin" on space_memberships
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "memberships_write_admin" on space_memberships;
create policy "memberships_write_admin" on space_memberships
  for all using (public.is_admin()) with check (public.is_admin());

create policy "folders_select_member" on folders
  for select using (public.can_view_space(space_id));

create policy "folders_insert_editor" on folders
  for insert with check (public.can_edit_space(space_id));

create policy "folders_update_editor" on folders
  for update using (public.can_edit_space(space_id));

create policy "folders_delete_editor" on folders
  for delete using (public.can_edit_space(space_id));

create policy "assets_select_member" on assets
  for select using (public.can_view_space(space_id));

create policy "assets_insert_editor" on assets
  for insert with check (public.can_edit_space(space_id));

create policy "assets_update_editor" on assets
  for update using (public.can_edit_space(space_id));

create policy "assets_delete_editor" on assets
  for delete using (public.can_edit_space(space_id));

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on spaces to authenticated;
grant select, insert, update, delete on space_memberships to authenticated;
grant execute on function public.space_role(uuid) to authenticated;
grant execute on function public.can_view_space(uuid) to authenticated;
grant execute on function public.can_edit_space(uuid) to authenticated;
grant execute on function public.can_download_space(uuid) to authenticated;
grant execute on function search_assets_fts(text, uuid, text) to authenticated;
grant execute on function search_assets_trgm(text, uuid, text) to authenticated;

do $$ begin
  drop type if exists brand_role;
exception
  when dependent_objects_still_exist then null;
end $$;
