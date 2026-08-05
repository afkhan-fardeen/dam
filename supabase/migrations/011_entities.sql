-- Phase 1: Entities (CKP)
-- entity_types (admin-extensible), entities, asset_entities

create table if not exists entity_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  label text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  type_id uuid not null references entity_types(id),
  name text not null,
  aliases text[] not null default '{}',
  description text,
  status text not null default 'active'
    check (status in ('active', 'archived', 'merged')),
  merged_into_id uuid references entities(id),
  roles text[] not null default '{}',
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists entities_name_trgm_idx on entities using gin (name gin_trgm_ops);
create index if not exists entities_aliases_idx on entities using gin (aliases);
create index if not exists entities_type_status_idx on entities (type_id, status);
create index if not exists entities_name_lower_idx on entities (lower(name));

create table if not exists asset_entities (
  asset_id uuid not null references assets(id) on delete cascade,
  entity_id uuid not null references entities(id) on delete cascade,
  relation_label text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  primary key (asset_id, entity_id)
);

create index if not exists asset_entities_entity_idx on asset_entities (entity_id);

-- Seed default types (no customer — D10)
insert into entity_types (name, label, is_system) values
  ('organization', 'Organization', true),
  ('person', 'Person', true),
  ('campaign', 'Campaign', true),
  ('product', 'Product', true),
  ('project', 'Project', true),
  ('location', 'Location', true),
  ('supplier', 'Supplier', true),
  ('agency', 'Agency', true)
on conflict (name) do nothing;

-- Helper: editor on at least one space (or admin)
create or replace function public.can_edit_any_space()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1 from space_memberships
      where user_id = auth.uid() and role = 'editor'
    );
$$;

grant execute on function public.can_edit_any_space() to authenticated;

-- Duplicate suggestion RPC
create or replace function suggest_similar_entities(
  q text,
  p_type_id uuid default null
)
returns setof entities
language sql
stable
security invoker
as $$
  select e.*
  from entities e
  where e.status = 'active'
    and (p_type_id is null or e.type_id = p_type_id)
    and (
      e.name % q
      or exists (select 1 from unnest(e.aliases) al where al % q)
      or e.name ilike '%' || q || '%'
    )
  order by similarity(e.name, q) desc
  limit 8;
$$;

grant execute on function suggest_similar_entities(text, uuid) to authenticated;

-- RLS
alter table entity_types enable row level security;
alter table entities enable row level security;
alter table asset_entities enable row level security;

drop policy if exists entity_types_select on entity_types;
create policy entity_types_select on entity_types
  for select using (auth.role() = 'authenticated');

drop policy if exists entity_types_admin_write on entity_types;
create policy entity_types_admin_write on entity_types
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists entities_select on entities;
create policy entities_select on entities
  for select using (auth.role() = 'authenticated');

drop policy if exists entities_insert on entities;
create policy entities_insert on entities
  for insert with check (public.can_edit_any_space());

drop policy if exists entities_update_admin on entities;
create policy entities_update_admin on entities
  for update using (public.is_admin());

drop policy if exists entities_delete_admin on entities;
create policy entities_delete_admin on entities
  for delete using (public.is_admin());

drop policy if exists asset_entities_select on asset_entities;
create policy asset_entities_select on asset_entities
  for select using (
    exists (
      select 1 from assets a
      where a.id = asset_id and public.can_view_space(a.space_id)
    )
  );

drop policy if exists asset_entities_write on asset_entities;
create policy asset_entities_write on asset_entities
  for all using (
    exists (
      select 1 from assets a
      where a.id = asset_id and public.can_edit_space(a.space_id)
    )
  )
  with check (
    exists (
      select 1 from assets a
      where a.id = asset_id and public.can_edit_space(a.space_id)
    )
  );

grant select on entity_types to authenticated;
grant select, insert, update, delete on entity_types to authenticated;
grant select, insert, update, delete on entities to authenticated;
grant select, insert, update, delete on asset_entities to authenticated;
