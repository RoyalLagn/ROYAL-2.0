begin;

-- resolve_subscription_checkout returns a column named plan_id. Its billing
-- option lookup also referenced plan_id without a table qualifier, so
-- PL/pgSQL rejected authenticated quote creation as ambiguous.
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(procedure.oid)
  into function_definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'resolve_subscription_checkout'
    and pg_get_function_identity_arguments(procedure.oid) =
      'target_vendor_id uuid, target_plan_id uuid, target_offer_id uuid, target_billing_option_id uuid, evaluated_at timestamp with time zone';

  if function_definition is null then
    raise exception 'resolve_subscription_checkout function was not found';
  end if;

  function_definition := replace(
    function_definition,
    'where id = target_billing_option_id and plan_id = target_plan_id and is_active',
    'where id = target_billing_option_id and public.subscription_plan_billing_options.plan_id = target_plan_id and is_active'
  );

  execute function_definition;
end;
$$;

commit;
