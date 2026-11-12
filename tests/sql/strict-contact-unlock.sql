-- Run as postgres against the migrated database; all fixture updates roll back.
begin;
do $$
declare
  booking_ref text; customer uuid; owner_id uuid; payment text; status text;
  details jsonb; expected boolean; rejected boolean;
begin
  if has_function_privilege('anon','public.get_secure_booking_details(text)','execute') then
    raise exception 'Anonymous execution must be revoked';
  end if;
  if not has_function_privilege('authenticated','public.get_secure_booking_details(text)','execute')
    or not has_function_privilege('service_role','public.get_secure_booking_details(text)','execute') then
    raise exception 'Required authenticated/service access is missing';
  end if;
  select b.id::text,b.customer_id,v.profile_id into booking_ref,customer,owner_id
  from public.vendor_bookings b join public.vendors v on v.id=b.vendor_id
  where b.customer_id is not null and v.profile_id is not null and b.customer_id<>v.profile_id
    and not exists(select 1 from public.profiles p where p.id in (b.customer_id,v.profile_id) and p.role::text in ('admin','super_admin'))
  limit 1;
  if booking_ref is null then raise exception 'An owned customer/vendor booking is required for rollback verification'; end if;
  foreach payment in array array['pending','failed','refunded','paid_advance','paid_booking_fee','free_zero_fee','paid'] loop
    foreach status in array array['ADMIN_PENDING','VENDOR_PENDING','ACCEPTED','accepted','confirmed','CUSTOMER_CANCELLED','ADMIN_CANCELLED','VENDOR_REJECTED','cancelled_by_customer','completed'] loop
      -- Emulate the trusted backend only while preparing each fixture.
      perform set_config('request.jwt.claim.sub','',true);
      perform set_config('request.jwt.claims','{"role":"service_role"}',true);
      update public.vendor_bookings set booking_status='ADMIN_PENDING',payment_status='pending' where id::text=booking_ref;
      update public.vendor_bookings set booking_status=status,payment_status=payment where id::text=booking_ref;
      expected := payment in ('paid_advance','paid_booking_fee','free_zero_fee','paid') and status in ('ACCEPTED','accepted','confirmed');
      perform set_config('request.jwt.claim.sub',customer::text,true);
      perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',customer)::text,true);
      details := public.get_secure_booking_details(booking_ref);
      if (details->>'contacts_unlocked')::boolean is distinct from expected then
        raise exception 'Customer unlock mismatch for % / %',payment,status;
      end if;
      if not expected and details #>> '{vendor,contact_phone}' is not null then
        raise exception 'Vendor contact leaked before payment plus acceptance';
      end if;
      perform set_config('request.jwt.claim.sub',owner_id::text,true);
      perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',owner_id)::text,true);
      details := public.get_secure_booking_details(booking_ref);
      if (details->>'contacts_unlocked')::boolean is distinct from expected then
        raise exception 'Vendor unlock mismatch for % / %',payment,status;
      end if;
      if not expected and (details #>> '{customer,phone}' is not null or details #>> '{customer,email}' is not null) then
        raise exception 'Customer contact leaked before payment plus acceptance';
      end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
  rejected := false;
  begin
    perform public.get_secure_booking_details(booking_ref);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Unrelated customer must not access the booking'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  rejected := false;
  begin
    perform public.get_secure_booking_details(booking_ref);
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Missing identity must not access booking details'; end if;
end $$;
rollback;
select 'PASS: 70 payment/status combinations for customer and vendor; unrelated/missing identity denied; all booking changes rolled back' as result;
