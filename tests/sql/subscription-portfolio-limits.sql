-- Run as postgres against the migrated database. All fixture writes roll back.
begin;
do $$
declare
  target_vendor uuid; owner_id uuid; target_subscription uuid; tier text;
  target_plan uuid; album_id uuid; album_ids uuid[]; i integer; j integer;
  album_cap integer; photo_cap integer; image_cap bigint; blocked boolean;
  checkout record; billing record;
begin
  select v.id,v.profile_id,s.id into target_vendor,owner_id,target_subscription
  from public.vendors v join public.vendor_subscriptions s on s.vendor_id=v.id
  where v.profile_id is not null and s.status='active'
    and not exists(select 1 from public.vendor_portfolio_albums a where a.vendor_id=v.id)
  limit 1;
  if target_vendor is null then raise exception 'Test needs an active vendor with no albums'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);

  -- Verify server checkout prices, including conversion to Razorpay paise.
  for billing in select b.*,p.slug from public.subscription_plan_billing_options b
    join public.subscription_plans p on p.id=b.plan_id
    where p.slug='premium' and b.billing_interval in ('month','year') loop
    select * into checkout from public.resolve_subscription_checkout(target_vendor,billing.plan_id,null,billing.id,now());
    if checkout.amount_minor <> (case when billing.billing_interval='year' then 358800 else 29900 end) then
      raise exception 'Incorrect server checkout amount for %: %',billing.billing_interval,checkout.amount_minor;
    end if;
  end loop;

  foreach tier in array array['free','premium'] loop
    -- Roll back each tier's fixture changes using an explicit sentinel exception.
    begin
      select id into target_plan from public.subscription_plans where slug=tier;
      update public.vendor_subscriptions set plan_id=target_plan,plan_snapshot=null,
        expiry_date=null,grace_period_end_date=null where id=target_subscription;
      album_cap := case when tier='premium' then 5 else 3 end;
      photo_cap := case when tier='premium' then 10 else 5 end;
      image_cap := case when tier='premium' then 5 else 3 end * 1024::bigint*1024;
      album_ids := '{}';
      for i in 1..album_cap loop
        insert into public.vendor_portfolio_albums(vendor_id,title,is_visible)
        values(target_vendor,'Limit verification '||i,false) returning id into album_id;
        album_ids := array_append(album_ids,album_id);
      end loop;
      blocked := false;
      begin
        insert into public.vendor_portfolio_albums(vendor_id,title,is_visible)
        values(target_vendor,'Excess album',false);
      exception when raise_exception then
        if sqlerrm not like '%maximum of % albums%' then raise; end if;
        blocked := true;
      end;
      if not blocked then raise exception 'Album cap bypassed for %',tier; end if;

      blocked := false;
      begin
        insert into public.vendor_portfolio_media(vendor_id,album_id,secure_url,public_id,resource_type,bytes,original_size_bytes)
        values(target_vendor,album_ids[1],'https://res.cloudinary.com/hp6vu8o9/image/upload/test.jpg',gen_random_uuid()::text,'image',image_cap+1,image_cap+1);
      exception when raise_exception then
        if sqlerrm not like '%image uploads up to % MB%' then raise; end if;
        blocked := true;
      end;
      if not blocked then raise exception 'Image size cap bypassed for %',tier; end if;

      -- Accept the exact size boundary, filling every permitted album.
      for i in 1..album_cap loop
        for j in 1..photo_cap loop
          insert into public.vendor_portfolio_media(vendor_id,album_id,secure_url,public_id,resource_type,bytes,original_size_bytes)
          values(target_vendor,album_ids[i],'https://res.cloudinary.com/hp6vu8o9/image/upload/test.jpg',gen_random_uuid()::text,'image',image_cap,image_cap);
        end loop;
      end loop;
      blocked := false;
      begin
        insert into public.vendor_portfolio_media(vendor_id,album_id,secure_url,public_id,resource_type,bytes)
        values(target_vendor,album_ids[1],'https://res.cloudinary.com/hp6vu8o9/image/upload/test.jpg',gen_random_uuid()::text,'image',100);
      exception when raise_exception then
        if sqlerrm not like '%maximum of % photos per album%' then raise; end if;
        blocked := true;
      end;
      if not blocked then raise exception 'Per-album cap bypassed for %',tier; end if;
      blocked := false;
      begin
        perform public.reserve_photo_upload_slot(target_vendor,gen_random_uuid()::text,'image');
      exception when raise_exception then
        if sqlerrm not like '%reached your limit%' then raise; end if;
        blocked := true;
      end;
      if not blocked then raise exception 'Total quota bypassed for %',tier; end if;
      raise exception using errcode='Z0001',message='tier passed; undo fixture';
    exception when sqlstate 'Z0001' then null;
    end;
  end loop;
end $$;
rollback;
select 'PASS: monthly/yearly checkout; Free 3x5/3MB; Premium 5x10/5MB; total reservations; all fixture writes rolled back' as result;
