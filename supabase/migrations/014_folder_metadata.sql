-- Folder metadata + inheritance helpers (brand on assets, folder_tags).
begin;

alter table folders
  add column if not exists description text,
  add column if not exists notes text,
  add column if not exists brand text;

alter table assets
  add column if not exists brand text;

create table if not exists folder_tags (
  folder_id uuid not null references folders (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  primary key (folder_id, tag_id)
);

create index if not exists folder_tags_tag_idx on folder_tags (tag_id);

alter table folder_tags enable row level security;

drop policy if exists "folder_tags_select" on folder_tags;
create policy "folder_tags_select" on folder_tags
  for select using (
    exists (
      select 1 from folders f
      where f.id = folder_id and public.can_view_space(f.space_id)
    )
  );

drop policy if exists "folder_tags_write" on folder_tags;
create policy "folder_tags_write" on folder_tags
  for all using (
    exists (
      select 1 from folders f
      where f.id = folder_id and public.can_edit_space(f.space_id)
    )
  )
  with check (
    exists (
      select 1 from folders f
      where f.id = folder_id and public.can_edit_space(f.space_id)
    )
  );

grant select, insert, update, delete on folder_tags to authenticated;

-- Rebuild search_vector to include brand
alter table assets drop column if exists search_vector;
alter table assets add column search_vector tsvector
  generated always as (
    to_tsvector(
      'english',
      coalesce(original_name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(created_by, '') || ' ' ||
      coalesce(tags_text, '') || ' ' ||
      coalesce(brand, '')
    )
  ) stored;

create index if not exists assets_search_idx on assets using gin (search_vector);
create index if not exists assets_brand_trgm_idx on assets using gin (brand gin_trgm_ops);

-- Refresh FTS RPC to include brand in trigram fallback
create or replace function search_assets_trgm(q text, p_space_id uuid, tag_filter text default null)
returns setof assets
language sql
stable
as $$
  select *
  from assets
  where status = 'active'
    and space_id = p_space_id
    and (
      original_name % q
      or description % q
      or created_by % q
      or tags_text % q
      or brand % q
    )
    and (
      tag_filter is null
      or exists (
        select 1 from asset_tags at
        join tags t on t.id = at.tag_id
        where at.asset_id = assets.id and t.name = tag_filter
      )
    )
  order by greatest(
    similarity(coalesce(original_name, ''), q),
    similarity(coalesce(description, ''), q),
    similarity(coalesce(created_by, ''), q),
    similarity(coalesce(tags_text, ''), q),
    similarity(coalesce(brand, ''), q)
  ) desc
  limit 40;
$$;

create or replace function search_assets_fts(q text, p_space_id uuid, tag_filter text default null)
returns setof assets
language sql
stable
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

grant execute on function search_assets_fts(text, uuid, text) to authenticated;
grant execute on function search_assets_trgm(text, uuid, text) to authenticated;

commit;
