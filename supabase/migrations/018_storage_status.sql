-- Live disk usage singleton (plan-001 §4.3)

begin;

create table if not exists storage_status (
  id int primary key default 1,
  total_bytes bigint not null default 0,
  used_bytes bigint not null default 0,
  available_bytes bigint not null default 0,
  storage_root text not null default '',
  checked_at timestamptz not null default now(),
  constraint storage_status_singleton check (id = 1)
);

insert into storage_status (id, total_bytes, used_bytes, available_bytes, storage_root)
values (1, 0, 0, 0, '')
on conflict (id) do nothing;

alter table storage_status enable row level security;

drop policy if exists storage_status_select_admin on storage_status;
create policy storage_status_select_admin on storage_status
  for select using (public.is_admin());

-- Writes happen via service role from Windows sync / Next admin proxy
grant select on storage_status to authenticated;

commit;
