begin;
set local lock_timeout = '5s';

-- New purchases use these prices. Historical payments and paid periods are preserved.
update public.subscription_plans set
  price = case when slug = 'premium' then 299 else 0 end,
  discounted_price = null,
  max_image_upload_mb = case when slug = 'premium' then 5 else 3 end,
  stored_image_target_mb = case when slug = 'premium' then 5 else 3 end
where slug in ('free', 'premium');

update public.subscription_plan_billing_options b set
  price = case when p.slug = 'premium' then 299 else 0 end,
  discounted_price = null, discount_percentage = 0, is_active = true
from public.subscription_plans p
where b.plan_id = p.id and p.slug in ('free','premium') and b.billing_interval = 'month';

insert into public.subscription_plan_billing_options
  (plan_id, billing_interval, interval_count, price, currency, is_active, discount_percentage)
select p.id, 'year', 1, case when p.slug = 'premium' then 3588 else 0 end, 'INR', true, 0
from public.subscription_plans p where p.slug in ('free','premium')
and not exists (select 1 from public.subscription_plan_billing_options b where b.plan_id=p.id and b.billing_interval='year');

update public.subscription_plan_billing_options b set
  price = case when p.slug = 'premium' then 3588 else 0 end,
  discount_percentage = 0, is_active = true
from public.subscription_plans p
where b.plan_id=p.id and p.slug in ('free','premium') and b.billing_interval='year';

-- Prevent an unclaimed quote at the previous price from starting a new checkout.
update public.subscription_checkout_quotes q set quote_expires_at = least(q.quote_expires_at, now())
from public.subscription_plans p where p.id=q.plan_id and p.slug in ('free','premium')
and q.used_at is null and q.payment_id is null;

create or replace function private.portfolio_plan_limits(target_vendor_id uuid)
returns table (albums integer, media_per_album integer, image_mb integer)
language sql stable security definer set search_path = '' as $$
  select case when p.slug='premium' then 5 else 3 end,
         case when p.slug='premium' then 10 else 5 end,
         p.max_image_upload_mb
  from public.subscription_effective_access(target_vendor_id, now()) a
  join public.subscription_plans p on p.id=a.plan_id
  where a.has_access;
$$;
revoke all on function private.portfolio_plan_limits(uuid) from public, anon, authenticated;

create or replace function private.validate_portfolio_album()
returns trigger language plpgsql security definer set search_path = '' as $$
declare album_count integer; album_limit integer;
begin
  new.title := btrim(new.title);
  new.description := nullif(btrim(new.description), '');
  if char_length(new.title)<1 or char_length(new.title)>60 then
    raise exception 'Album name must be between 1 and 60 characters';
  end if;
  if new.description is not null and char_length(new.description)>300 then
    raise exception 'Album description must not exceed 300 characters';
  end if;
  if tg_op='UPDATE' and new.vendor_id is distinct from old.vendor_id then
    raise exception 'Album ownership cannot be changed';
  end if;
  if tg_op='INSERT' then
    perform pg_advisory_xact_lock(hashtext('portfolio-albums:' || new.vendor_id::text));
    select albums into album_limit from private.portfolio_plan_limits(new.vendor_id);
    if album_limit is null then raise exception 'An active subscription is required'; end if;
    select count(*) into album_count from public.vendor_portfolio_albums where vendor_id=new.vendor_id;
    if album_count>=album_limit then
      raise exception 'Your plan allows a maximum of % albums', album_limit;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.validate_portfolio_media()
returns trigger language plpgsql security definer set search_path = '' as $$
declare album_vendor uuid; current_count integer; album_limit integer; image_limit integer; total_limit integer;
begin
  if tg_op='UPDATE' and new.vendor_id is distinct from old.vendor_id then
    raise exception 'Media ownership cannot be changed';
  end if;
  -- Same lock as photo reservations; serialize direct inserts and upload finalization.
  perform pg_advisory_xact_lock(hashtext('photo:' || new.vendor_id::text));
  select a.vendor_id into album_vendor from public.vendor_portfolio_albums a where a.id=new.album_id for update;
  if album_vendor is null or album_vendor<>new.vendor_id then
    raise exception 'Portfolio album does not belong to this vendor';
  end if;
  if tg_op='INSERT' or new.album_id is distinct from old.album_id then
    select media_per_album, image_mb into album_limit, image_limit from private.portfolio_plan_limits(new.vendor_id);
    if album_limit is null then raise exception 'An active subscription is required'; end if;
    select count(*) into current_count from public.vendor_portfolio_media where album_id=new.album_id and id is distinct from new.id;
    if current_count>=album_limit then
      raise exception 'Your plan allows a maximum of % photos per album', album_limit;
    end if;
  end if;
  if tg_op='INSERT' then
    if new.resource_type<>'image' then raise exception 'Portfolio video uploads are disabled'; end if;
    if coalesce(new.bytes,0)<=0 or new.bytes>image_limit::bigint*1024*1024
      or coalesce(new.original_size_bytes,new.bytes)>image_limit::bigint*1024*1024 then
      raise exception 'Your plan allows image uploads up to % MB', image_limit;
    end if;
    total_limit := private.vendor_photo_limit(new.vendor_id);
    select count(*) into current_count from public.vendor_portfolio_media where vendor_id=new.vendor_id and resource_type='image';
    if current_count>=total_limit then raise exception 'You have reached your limit of % photos', total_limit; end if;
  end if;
  if new.width is not null and new.height is not null and new.height>0 then
    new.aspect_ratio := new.width::numeric/new.height;
  end if;
  return new;
end;
$$;

commit;
