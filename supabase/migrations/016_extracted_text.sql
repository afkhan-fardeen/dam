-- Phase H: OCR / extracted text for FTS

alter table assets add column if not exists extracted_text text;

alter table assets drop column if exists search_vector;
alter table assets add column search_vector tsvector
  generated always as (
    to_tsvector(
      'english',
      coalesce(original_name, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(created_by, '') || ' ' ||
      coalesce(tags_text, '') || ' ' ||
      coalesce(brand, '') || ' ' ||
      coalesce(extracted_text, '')
    )
  ) stored;

create index if not exists assets_search_idx on assets using gin (search_vector);

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
      or extracted_text % q
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
    similarity(coalesce(brand, ''), q),
    similarity(coalesce(extracted_text, ''), q)
  ) desc
  limit 40;
$$;

grant execute on function search_assets_trgm(text, uuid, text) to authenticated;
