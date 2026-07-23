create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  file_id text not null unique,
  original_name text,
  mime_type text,
  size bigint,
  brand text,
  category text,
  description text,
  created_by text,
  has_thumbnail boolean default false,
  status text default 'active',
  created_at timestamptz default now(),
  search_vector tsvector
    generated always as (
      to_tsvector(
        'english',
        coalesce(original_name, '') || ' ' ||
        coalesce(description, '') || ' ' ||
        coalesce(brand, '') || ' ' ||
        coalesce(category, '') || ' ' ||
        coalesce(created_by, '')
      )
    ) stored
);

create index if not exists assets_search_idx on assets using gin (search_vector);
create index if not exists assets_created_by_trgm_idx on assets using gin (created_by gin_trgm_ops);
create index if not exists assets_description_trgm_idx on assets using gin (description gin_trgm_ops);
create index if not exists assets_original_name_trgm_idx on assets using gin (original_name gin_trgm_ops);
create index if not exists assets_status_created_at_idx on assets (status, created_at desc);

create or replace function search_assets_trgm(
  q text,
  brand_filter text default null,
  category_filter text default null
)
returns setof assets
language sql
stable
as $$
  select * from assets
  where status = 'active'
    and (created_by % q or description % q or original_name % q)
    and (brand_filter is null or brand = brand_filter)
    and (category_filter is null or category = category_filter)
  order by greatest(
    similarity(coalesce(created_by, ''), q),
    similarity(coalesce(description, ''), q),
    similarity(coalesce(original_name, ''), q)
  ) desc
  limit 20;
$$;

create or replace function search_assets_fts(
  q text,
  brand_filter text default null,
  category_filter text default null
)
returns setof assets
language sql
stable
as $$
  select *
  from assets
  where status = 'active'
    and search_vector @@ websearch_to_tsquery('english', q)
    and (brand_filter is null or brand = brand_filter)
    and (category_filter is null or category = category_filter)
  order by ts_rank(search_vector, websearch_to_tsquery('english', q)) desc
  limit 20;
$$;
