-- Phase 3: Search covers entities + attribute values

create or replace function search_entities_trgm(q text, limit_n int default 20)
returns table (
  id uuid,
  type_id uuid,
  name text,
  aliases text[],
  description text,
  status text,
  merged_into_id uuid,
  roles text[],
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security invoker
as $$
  select e.id, e.type_id, e.name, e.aliases, e.description, e.status,
         e.merged_into_id, e.roles, e.created_by, e.created_at, e.updated_at
  from entities e
  where e.status = 'active'
    and (
      e.name % q
      or e.name ilike '%' || q || '%'
      or exists (select 1 from unnest(e.aliases) al where al % q or al ilike '%' || q || '%')
    )
  order by similarity(e.name, q) desc nulls last
  limit greatest(limit_n, 1);
$$;

grant execute on function search_entities_trgm(text, int) to authenticated;

-- Assets linked to entities matching q (permission via RLS on assets when selected later)
create or replace function search_asset_ids_by_entity(q text)
returns table (asset_id uuid)
language sql
stable
security invoker
as $$
  select distinct ae.asset_id
  from asset_entities ae
  join entities e on e.id = ae.entity_id
  where e.status = 'active'
    and (
      e.name ilike '%' || q || '%'
      or e.name % q
      or exists (select 1 from unnest(e.aliases) al where al ilike '%' || q || '%' or al % q)
    )
  limit 40;
$$;

grant execute on function search_asset_ids_by_entity(text) to authenticated;

create or replace function search_asset_ids_by_attribute(q text)
returns table (asset_id uuid)
language sql
stable
security invoker
as $$
  select distinct v.asset_id
  from asset_attribute_values v
  join attribute_defs d on d.id = v.attribute_def_id
  where d.status = 'active'
    and d.searchable = true
    and (
      (v.value_text is not null and (v.value_text ilike '%' || q || '%' or v.value_text % q))
      or (v.value_number is not null and v.value_number::text = q)
      or (v.value_date is not null and v.value_date::text = q)
    )
  limit 40;
$$;

grant execute on function search_asset_ids_by_attribute(text) to authenticated;
