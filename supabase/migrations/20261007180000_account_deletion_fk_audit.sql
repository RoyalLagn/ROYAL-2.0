-- Migration: 20261007180000_account_deletion_fk_audit.sql
-- Function to inspect all foreign key relationships targeting auth.users and public.profiles

begin;

create or replace function public.get_foreign_keys_for_audit()
returns table (
  table_schema text,
  table_name text,
  column_name text,
  foreign_table_schema text,
  foreign_table_name text,
  foreign_column_name text,
  on_delete text,
  constraint_name text
)
language sql
security definer
set search_path = ''
as $$
  select
    tc.table_schema::text,
    tc.table_name::text,
    kcu.column_name::text,
    ccu.table_schema::text as foreign_table_schema,
    ccu.table_name::text as foreign_table_name,
    ccu.column_name::text as foreign_column_name,
    rc.delete_rule::text as on_delete,
    tc.constraint_name::text
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on tc.constraint_name = kcu.constraint_name
    and tc.table_schema = kcu.table_schema
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name
    and ccu.table_schema = tc.table_schema
  join information_schema.referential_constraints rc
    on tc.constraint_name = rc.constraint_name
    and tc.table_schema = rc.constraint_schema
  where tc.constraint_type = 'FOREIGN KEY'
    and (ccu.table_name in ('users', 'profiles') or kcu.column_name in ('customer_id', 'profile_id', 'user_id', 'referrer_id', 'referred_customer_id'))
  order by tc.table_name, kcu.column_name;
$$;

grant execute on function public.get_foreign_keys_for_audit() to service_role;

commit;
