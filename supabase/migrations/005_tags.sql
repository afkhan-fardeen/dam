-- Replace single category with many-to-many tags (from new-updates.md)
-- Also updates search RPCs to filter by tag name instead of category.

begin;

-- 1. Tags + join table
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

create table if not exists asset_tags (
  asset_id uuid references assets(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (asset_id, tag_id)
);

-- 2. Migrate existing category values into tags (if column still exists)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assets' and column_name = 'category'
  ) then
    insert into tags (name)
    select distinct trim(category)
    from assets
    where category is not null and trim(category) <> ''
    on conflict (name) do nothing;

    insert into asset_tags (asset_id, tag_id)
    select a.id, t.id
    from assets a
    join tags t on t.name = trim(a.category)
    where a.category is not null and trim(a.category) <> ''
    on conflict do nothing;
  end if;
end $$;

-- 3. Denormalized tags_text for search_vector
alter table assets add column if not exists tags_text text default '';

update assets a set tags_text = coalesce((
  select string_agg(t.name, ' ' order by t.name)
  from tags t
  join asset_tags at on at.tag_id = t.id
  where at.asset_id = a.id
), '');

create or replace function sync_asset_tags_text() returns trigger as $$
begin
  update assets set tags_text = coalesce((
    select string_agg(t.name, ' ' order by t.name) from tags t
    join asset_tags at on at.tag_id = t.id
    where at.asset_id = coalesce(new.asset_id, old.asset_id)
  ), '')
  where id = coalesce(new.asset_id, old.asset_id);
  return null;
end;
$$ language plpgsql;

drop trigger if exists asset_tags_sync on asset_tags;
create trigger asset_tags_sync
after insert or delete on asset_tags
for each row execute function sync_asset_tags_text();

-- 4. Rebuild search_vector to include tags_text (drop category from it)
alter table assets drop column if exists search_vector;
alter table assets add column search_vector tsvector
  generated always as (
    to_tsvector('english',
      coalesce(original_name,'') || ' ' || coalesce(description,'') || ' ' ||
      coalesce(created_by,'') || ' ' || coalesce(tags_text,'')
    )
  ) stored;

drop index if exists assets_search_idx;
create index assets_search_idx on assets using gin(search_vector);
create index if not exists assets_tags_trgm_idx on assets using gin (tags_text gin_trgm_ops);

-- 5. Drop old category column
alter table assets drop column if exists category;

-- 6. Search RPCs: tag_filter instead of category_filter
drop function if exists search_assets_trgm(text, uuid, text);
drop function if exists search_assets_fts(text, uuid, text);

create or replace function search_assets_trgm(
  q text,
  p_space_id uuid,
  tag_filter text default null
)
returns setof assets
language sql
stable
security invoker
as $$
  select * from assets
  where status = 'active'
    and space_id = p_space_id
    and (created_by % q or description % q or original_name % q or tags_text % q)
    and (
      tag_filter is null
      or exists (
        select 1 from asset_tags at
        join tags t on t.id = at.tag_id
        where at.asset_id = assets.id and t.name = tag_filter
      )
    )
  order by greatest(
    similarity(coalesce(created_by, ''), q),
    similarity(coalesce(description, ''), q),
    similarity(coalesce(original_name, ''), q),
    similarity(coalesce(tags_text, ''), q)
  ) desc
  limit 40;
$$;

create or replace function search_assets_fts(
  q text,
  p_space_id uuid,
  tag_filter text default null
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
    and (
      tag_filter is null
      or exists (
        select 1 from asset_tags at
        join tags t on t.id = at.tag_id
        where at.asset_id = assets.id and t.name = tag_filter
      )
    )
  order by ts_rank(search_vector, websearch_to_tsquery('english', q)) desc
  limit 40;
$$;

-- RLS for tags
alter table tags enable row level security;
alter table asset_tags enable row level security;

drop policy if exists "tags_select_authenticated" on tags;
create policy "tags_select_authenticated" on tags
  for select using (auth.uid() is not null);

drop policy if exists "tags_write_admin_or_editor" on tags;
create policy "tags_write_admin_or_editor" on tags
  for all using (public.is_admin() or auth.uid() is not null)
  with check (public.is_admin() or auth.uid() is not null);

drop policy if exists "asset_tags_select" on asset_tags;
create policy "asset_tags_select" on asset_tags
  for select using (
    exists (
      select 1 from assets a
      where a.id = asset_id and public.can_view_space(a.space_id)
    )
  );

drop policy if exists "asset_tags_write" on asset_tags;
create policy "asset_tags_write" on asset_tags
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

grant select, insert, update, delete on tags to authenticated;
grant select, insert, update, delete on asset_tags to authenticated;
grant execute on function search_assets_fts(text, uuid, text) to authenticated;
grant execute on function search_assets_trgm(text, uuid, text) to authenticated;

commit;
