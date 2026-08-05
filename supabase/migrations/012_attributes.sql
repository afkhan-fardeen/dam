-- Phase 2: Typed attributes (CKP)

create table if not exists attribute_defs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  label text not null,
  data_type text not null
    check (data_type in ('text', 'number', 'currency', 'boolean', 'date', 'dropdown')),
  dropdown_options text[],
  applicable_space_kind text
    check (applicable_space_kind is null or applicable_space_kind in ('brand', 'department')),
  searchable boolean not null default true,
  filterable boolean not null default true,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists asset_attribute_values (
  asset_id uuid not null references assets(id) on delete cascade,
  attribute_def_id uuid not null references attribute_defs(id) on delete cascade,
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (asset_id, attribute_def_id)
);

create index if not exists asset_attr_values_text_trgm
  on asset_attribute_values using gin (value_text gin_trgm_ops);

insert into attribute_defs (name, label, data_type, dropdown_options, applicable_space_kind) values
  ('invoice_number', 'Invoice Number', 'text', null, 'department'),
  ('amount', 'Amount', 'currency', null, 'department'),
  ('awb_number', 'AWB Number', 'text', null, 'department'),
  ('courier', 'Courier', 'text', null, 'department'),
  ('scheduled_date', 'Scheduled Date', 'date', null, null),
  ('platform', 'Platform', 'dropdown', array['Instagram','TikTok','Facebook','Website','Other'], 'brand'),
  ('contract_number', 'Contract Number', 'text', null, 'department'),
  ('expiry_date', 'Expiry Date', 'date', null, null)
on conflict (name) do nothing;

alter table attribute_defs enable row level security;
alter table asset_attribute_values enable row level security;

drop policy if exists attribute_defs_select on attribute_defs;
create policy attribute_defs_select on attribute_defs
  for select using (auth.role() = 'authenticated');

drop policy if exists attribute_defs_admin_write on attribute_defs;
create policy attribute_defs_admin_write on attribute_defs
  for all using (public.is_admin())
  with check (public.is_admin());

drop policy if exists asset_attr_values_select on asset_attribute_values;
create policy asset_attr_values_select on asset_attribute_values
  for select using (
    exists (
      select 1 from assets a
      where a.id = asset_id and public.can_view_space(a.space_id)
    )
  );

drop policy if exists asset_attr_values_write on asset_attribute_values;
create policy asset_attr_values_write on asset_attribute_values
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

grant select, insert, update, delete on attribute_defs to authenticated;
grant select, insert, update, delete on asset_attribute_values to authenticated;
