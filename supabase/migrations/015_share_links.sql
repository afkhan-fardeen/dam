-- Phase F: public share links for assets

create table if not exists share_links (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  token text not null unique,
  created_by uuid references profiles(id) on delete set null,
  can_download boolean not null default true,
  password_hash text,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists share_links_asset_idx on share_links(asset_id);
create index if not exists share_links_token_idx on share_links(token);

alter table share_links enable row level security;

create policy share_links_select_own on share_links
  for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from assets a
      join space_memberships m on m.space_id = a.space_id and m.user_id = auth.uid()
      where a.id = share_links.asset_id
    )
    or exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_admin = true
    )
  );

create policy share_links_insert on share_links
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from assets a
      join space_memberships m on m.space_id = a.space_id and m.user_id = auth.uid()
      where a.id = share_links.asset_id and m.role in ('editor', 'admin')
    )
    or exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_admin = true
    )
  );

create policy share_links_update on share_links
  for update to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from profiles p where p.id = auth.uid() and p.is_admin = true
    )
  );

grant select, insert, update on share_links to authenticated;
