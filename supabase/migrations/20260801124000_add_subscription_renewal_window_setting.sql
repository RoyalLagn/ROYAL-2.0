begin;

insert into public.application_settings(key, value, value_type, description, is_public)
values (
  'subscription_renewal_window_days',
  '7'::jsonb,
  'integer',
  'Show Vendor renewal actions this many days before access expires.',
  true
)
on conflict (key) do nothing;

commit;
