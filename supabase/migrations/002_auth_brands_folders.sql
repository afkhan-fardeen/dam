-- DAM v1.2: auth, brands, folders, activity, RLS
-- Clean start: truncate assets; replace free-text brand with brand_id

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------------
-- Core identity / org tables
-- ---------------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  color text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

do $$ begin
  create type brand_role as enum ('viewer', 'downloader', 'editor');
exception
  when duplicate_object then null;
end $$;

create table if not exists brand_memberships (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role brand_role not null,
  created_at timestamptz default now(),
  unique (brand_id, user_id)
);

create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade not null,
  parent_folder_id uuid references folders(id) on delete cascade,
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  brand_id uuid references brands(id),
  action text not null,
  target_type text,
  target_id uuid,
  details jsonb,
  created_at timestamptz default now()
);

create index if not exists folders_brand_parent_idx on folders (brand_id, parent_folder_id);
create index if not exists brand_memberships_user_idx on brand_memberships (user_id);
create index if not exists activity_log_created_idx on activity_log (created_at desc);
create index if not exists activity_log_brand_idx on activity_log (brand_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Clean assets + new columns
-- ---------------------------------------------------------------------------

truncate table assets;

drop function if exists search_assets_trgm(text, text, text);
drop function if exists search_assets_fts(text, text, text);

alter table assets drop column if exists search_vector;
alter table assets drop column if exists brand;

alter table assets add column if not exists brand_id uuid references brands(id);
alter table assets add column if not exists folder_id uuid references folders(id);
alter table assets add column if not exists uploaded_by uuid references profiles(id);

alter table assets
  add column if not exists search_vector tsvector
  generated always as (
    to_tsvector(
      'english',
      coalesce(original_name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(category, '') || ' ' ||
      coalesce(created_by, '')
    )
  ) stored;

create index if not exists assets_search_idx on assets using gin (search_vector);
create index if not exists assets_brand_folder_idx on assets (brand_id, folder_id, status);

-- ---------------------------------------------------------------------------
-- Profile auto-create on signup / invite accept
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, is_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    false
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(nullif(excluded.full_name, ''), profiles.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and is_admin = true
  );
$$;

create or replace function public.brand_role(p_brand_id uuid)
returns brand_role
language sql
stable
security definer
set search_path = public
as $$
  select role from brand_memberships
  where brand_id = p_brand_id and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.can_view_brand(p_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from brand_memberships
      where brand_id = p_brand_id and user_id = auth.uid()
    );
$$;

create or replace function public.can_edit_brand(p_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from brand_memberships
      where brand_id = p_brand_id
        and user_id = auth.uid()
        and role = 'editor'
    );
$$;

create or replace function public.can_download_brand(p_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from brand_memberships
      where brand_id = p_brand_id
        and user_id = auth.uid()
        and role in ('downloader', 'editor')
    );
$$;

-- ---------------------------------------------------------------------------
-- Search RPCs (brand_id scoped)
-- ---------------------------------------------------------------------------

create or replace function search_assets_trgm(
  q text,
  p_brand_id uuid,
  category_filter text default null
)
returns setof assets
language sql
stable
security invoker
as $$
  select * from assets
  where status = 'active'
    and brand_id = p_brand_id
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
  p_brand_id uuid,
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
    and brand_id = p_brand_id
    and search_vector @@ websearch_to_tsquery('english', q)
    and (category_filter is null or category = category_filter)
  order by ts_rank(search_vector, websearch_to_tsquery('english', q)) desc
  limit 40;
$$;

-- ---------------------------------------------------------------------------
-- Seed brands (clean)
-- ---------------------------------------------------------------------------

  insert into brands (name, slug, color)
values
  ('Loveboo', 'loveboo', '#4F6BFF'),
  ('Seissense', 'seissense', '#FF6B4A')
on conflict (slug) do update set
  name = excluded.name,
  color = excluded.color;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;
alter table brands enable row level security;
alter table brand_memberships enable row level security;
alter table folders enable row level security;
alter table assets enable row level security;
alter table activity_log enable row level security;

-- Profiles
drop policy if exists "profiles_select_own_or_admin" on profiles;
create policy "profiles_select_own_or_admin" on profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update using (id = auth.uid() or public.is_admin());

-- Brands: members see their brands; admins see all; only admins insert/update
drop policy if exists "brands_select_member_or_admin" on brands;
create policy "brands_select_member_or_admin" on brands
  for select using (public.can_view_brand(id));

drop policy if exists "brands_insert_admin" on brands;
create policy "brands_insert_admin" on brands
  for insert with check (public.is_admin());

drop policy if exists "brands_update_admin" on brands;
create policy "brands_update_admin" on brands
  for update using (public.is_admin());

drop policy if exists "brands_delete_admin" on brands;
create policy "brands_delete_admin" on brands
  for delete using (public.is_admin());

-- Memberships
drop policy if exists "memberships_select_own_or_admin" on brand_memberships;
create policy "memberships_select_own_or_admin" on brand_memberships
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "memberships_write_admin" on brand_memberships;
create policy "memberships_write_admin" on brand_memberships
  for all using (public.is_admin()) with check (public.is_admin());

-- Folders
drop policy if exists "folders_select_member" on folders;
create policy "folders_select_member" on folders
  for select using (public.can_view_brand(brand_id));

drop policy if exists "folders_insert_editor" on folders;
create policy "folders_insert_editor" on folders
  for insert with check (public.can_edit_brand(brand_id));

drop policy if exists "folders_update_editor" on folders;
create policy "folders_update_editor" on folders
  for update using (public.can_edit_brand(brand_id));

drop policy if exists "folders_delete_editor" on folders;
create policy "folders_delete_editor" on folders
  for delete using (public.can_edit_brand(brand_id));

-- Assets
drop policy if exists "assets_select_member" on assets;
create policy "assets_select_member" on assets
  for select using (public.can_view_brand(brand_id));

drop policy if exists "assets_insert_editor" on assets;
create policy "assets_insert_editor" on assets
  for insert with check (public.can_edit_brand(brand_id));

drop policy if exists "assets_update_editor" on assets;
create policy "assets_update_editor" on assets
  for update using (public.can_edit_brand(brand_id));

drop policy if exists "assets_delete_editor" on assets;
create policy "assets_delete_editor" on assets
  for delete using (public.can_edit_brand(brand_id));

-- Activity log
drop policy if exists "activity_select_admin" on activity_log;
create policy "activity_select_admin" on activity_log
  for select using (public.is_admin());

drop policy if exists "activity_insert_authenticated" on activity_log;
create policy "activity_insert_authenticated" on activity_log
  for insert with check (auth.uid() is not null and (user_id = auth.uid() or public.is_admin()));

-- Grants for authenticated role
grant usage on schema public to authenticated;
grant select, update on profiles to authenticated;
grant select, insert, update, delete on brands to authenticated;
grant select, insert, update, delete on brand_memberships to authenticated;
grant select, insert, update, delete on folders to authenticated;
grant select, insert, update, delete on assets to authenticated;
grant select, insert on activity_log to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.brand_role(uuid) to authenticated;
grant execute on function public.can_view_brand(uuid) to authenticated;
grant execute on function public.can_edit_brand(uuid) to authenticated;
grant execute on function public.can_download_brand(uuid) to authenticated;
grant execute on function search_assets_fts(text, uuid, text) to authenticated;
grant execute on function search_assets_trgm(text, uuid, text) to authenticated;
