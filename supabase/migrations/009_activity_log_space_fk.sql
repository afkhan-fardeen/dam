-- activity_log.space_id still referenced spaces via the old brand FK
-- (NO ACTION), which blocks space delete/archive cleanup.
-- Allow deleting spaces by nulling historical activity rows.

alter table activity_log
  drop constraint if exists activity_log_brand_id_fkey;

alter table activity_log
  drop constraint if exists activity_log_space_id_fkey;

alter table activity_log
  add constraint activity_log_space_id_fkey
  foreign key (space_id) references spaces(id) on delete set null;
