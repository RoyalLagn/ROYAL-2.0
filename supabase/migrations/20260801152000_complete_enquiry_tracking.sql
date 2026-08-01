begin;

create sequence if not exists public.vendor_enquiry_reference_seq start with 10000;

alter table public.vendor_enquiries
  add column if not exists reference_code text,
  add column if not exists guest_session_id uuid,
  add column if not exists enquiry_channel text not null default 'form',
  add column if not exists source_type text not null default 'vendor_profile',
  add column if not exists source_record_id text,
  add column if not exists customer_confirmation text not null default 'pending',
  add column if not exists vendor_notes text,
  add column if not exists follow_up_date date,
  add column if not exists booking_confirmed boolean not null default false,
  add column if not exists action_token uuid;

update public.vendor_enquiries
set reference_code = 'RL-ENQ-' || lpad(nextval('public.vendor_enquiry_reference_seq')::text, 5, '0')
where reference_code is null;

update public.vendor_enquiries set status = 'quotation_sent' where status = 'quoted';
update public.vendor_enquiries set guest_session_id = gen_random_uuid() where customer_id is null and guest_session_id is null;

alter table public.vendor_enquiries
  alter column reference_code set not null,
  drop constraint if exists vendor_enquiries_status_check,
  drop constraint if exists vendor_enquiries_enquiry_channel_check,
  drop constraint if exists vendor_enquiries_source_type_check,
  drop constraint if exists vendor_enquiries_customer_confirmation_check,
  add constraint vendor_enquiries_reference_code_key unique (reference_code),
  add constraint vendor_enquiries_action_token_key unique (action_token),
  add constraint vendor_enquiries_status_check check (status in (
    'new', 'contacted', 'in_discussion', 'quotation_sent', 'follow_up',
    'booked', 'not_interested', 'invalid_lead', 'no_response', 'closed'
  )),
  add constraint vendor_enquiries_enquiry_channel_check check (enquiry_channel in ('call', 'whatsapp', 'form')),
  add constraint vendor_enquiries_source_type_check check (source_type in (
    'vendor_profile', 'clip', 'portfolio', 'favorite', 'search', 'listing', 'package', 'other'
  )),
  add constraint vendor_enquiries_customer_confirmation_check check (
    customer_confirmation in ('pending', 'contacted', 'cancelled', 'closed')
  ),
  add constraint vendor_enquiries_actor_check check (
    customer_id is not null or guest_session_id is not null
  );

create index if not exists vendor_enquiries_customer_created_idx
  on public.vendor_enquiries(customer_id, created_at desc) where customer_id is not null;
create index if not exists vendor_enquiries_guest_created_idx
  on public.vendor_enquiries(guest_session_id, created_at desc) where guest_session_id is not null;
create index if not exists vendor_enquiries_source_idx
  on public.vendor_enquiries(vendor_id, source_type, created_at desc);
create index if not exists vendor_enquiries_channel_idx
  on public.vendor_enquiries(vendor_id, enquiry_channel, created_at desc);
create index if not exists vendor_enquiries_follow_up_idx
  on public.vendor_enquiries(vendor_id, follow_up_date) where follow_up_date is not null;

create or replace function private.assign_enquiry_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reference_code is null or btrim(new.reference_code) = '' then
    new.reference_code := 'RL-ENQ-' || lpad(nextval('public.vendor_enquiry_reference_seq')::text, 5, '0');
  end if;
  new.booking_confirmed := new.status = 'booked';
  return new;
end;
$$;

drop trigger if exists vendor_enquiries_assign_reference on public.vendor_enquiries;
create trigger vendor_enquiries_assign_reference
before insert or update of status on public.vendor_enquiries
for each row execute function private.assign_enquiry_reference();

create or replace function private.notify_vendor_about_enquiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.vendor_notifications (vendor_id, title, body, kind, target_path)
  values (
    new.vendor_id,
    case new.enquiry_channel when 'call' then 'New Call Click' when 'whatsapp' then 'New WhatsApp Click' else 'New customer enquiry' end,
    case new.enquiry_channel
      when 'call' then new.customer_name || ' opened the phone dialler. This does not confirm a connected call.'
      when 'whatsapp' then new.customer_name || ' opened WhatsApp. This does not confirm a sent message.'
      else new.customer_name || case when new.package_name is null then ' sent an enquiry.' else ' enquired about ' || new.package_name || '.' end
    end,
    'enquiry', '/VendorEnquiries'
  );
  return new;
end;
$$;

create or replace function private.notify_customer_about_enquiry_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare vendor_name text;
begin
  if new.customer_id is null or new.status is not distinct from old.status then return new; end if;
  select business_name into vendor_name from public.vendors where id = new.vendor_id;
  insert into public.customer_notifications (customer_id, type, title, message, target_path, metadata)
  values (
    new.customer_id, 'enquiry_status', 'Enquiry status updated',
    coalesce(vendor_name, 'Your vendor') || ' changed ' || new.reference_code || ' to ' || replace(initcap(new.status), '_', ' ') || '.',
    '/(tabs)/enquiry', jsonb_build_object('enquiry_id', new.id, 'reference_code', new.reference_code, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists vendor_enquiries_notify_customer_status on public.vendor_enquiries;
create trigger vendor_enquiries_notify_customer_status
after update of status on public.vendor_enquiries
for each row execute function private.notify_customer_about_enquiry_status();

create or replace function public.create_tracked_enquiry(
  target_vendor_id uuid,
  channel text,
  source text default 'vendor_profile',
  source_id text default null,
  guest_id uuid default null,
  request_token uuid default gen_random_uuid(),
  selected_package_id uuid default null,
  event_on date default null,
  event_kind text default null,
  enquiry_message text default null,
  customer_phone_input text default null
)
returns table (id uuid, reference_code text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  selected_vendor public.vendors%rowtype;
  selected_profile public.profiles%rowtype;
  existing public.vendor_enquiries%rowtype;
  actor_key text;
  safe_name text;
  safe_message text;
begin
  if channel not in ('call', 'whatsapp', 'form') then raise exception 'Invalid enquiry channel'; end if;
  if source not in ('vendor_profile', 'clip', 'portfolio', 'favorite', 'search', 'listing', 'package', 'other') then raise exception 'Invalid enquiry source'; end if;
  if current_user_id is null and guest_id is null then raise exception 'A guest session is required'; end if;
  if request_token is null then raise exception 'An action token is required'; end if;

  select * into selected_vendor from public.vendors where vendors.id = target_vendor_id;
  if selected_vendor.id is null or not private.vendor_is_public(target_vendor_id) then
    raise exception 'Vendor is not available';
  end if;
  if channel in ('call', 'whatsapp') and nullif(regexp_replace(coalesce(selected_vendor.contact_phone, ''), '[^0-9+]', '', 'g'), '') is null then
    raise exception 'This vendor has not added a contact number';
  end if;

  select * into existing from public.vendor_enquiries e where e.action_token = request_token;
  if existing.id is not null then
    return query select existing.id, existing.reference_code, existing.status;
    return;
  end if;

  actor_key := coalesce(current_user_id::text, guest_id::text);
  perform pg_advisory_xact_lock(hashtextextended(actor_key || ':' || target_vendor_id::text || ':' || channel || ':' || source || ':' || coalesce(source_id, ''), 0));

  select * into existing
  from public.vendor_enquiries e
  where e.vendor_id = target_vendor_id
    and e.enquiry_channel = channel
    and e.source_type = source
    and coalesce(e.source_record_id, '') = coalesce(source_id, '')
    and ((current_user_id is not null and e.customer_id = current_user_id)
      or (current_user_id is null and e.guest_session_id = guest_id))
    and e.created_at >= now() - interval '8 seconds'
  order by e.created_at desc limit 1;
  if existing.id is not null then
    return query select existing.id, existing.reference_code, existing.status;
    return;
  end if;

  if current_user_id is not null then
    select * into selected_profile from public.profiles where profiles.id = current_user_id;
  end if;
  safe_name := coalesce(nullif(btrim(selected_profile.full_name), ''), 'RoyalLagn guest');
  safe_message := coalesce(nullif(btrim(enquiry_message), ''), case channel
    when 'call' then 'Customer opened the phone dialler from RoyalLagn. This is a Call Click, not a confirmed or answered call.'
    when 'whatsapp' then 'Customer opened WhatsApp from RoyalLagn. This is a WhatsApp Enquiry Attempt, not a confirmed sent message.'
    else 'Customer sent an enquiry through RoyalLagn.' end);

  insert into public.vendor_enquiries (
    vendor_id, customer_id, guest_session_id, customer_name, customer_email, customer_phone,
    event_date, event_type, message, status, enquiry_channel, source_type, source_record_id,
    package_id, action_token
  ) values (
    target_vendor_id, current_user_id, case when current_user_id is null then guest_id else null end,
    safe_name, selected_profile.email, coalesce(nullif(btrim(customer_phone_input), ''), selected_profile.phone), event_on, nullif(btrim(event_kind), ''),
    safe_message, 'new', channel, source, nullif(btrim(source_id), ''), selected_package_id, request_token
  ) returning * into existing;

  return query select existing.id, existing.reference_code, existing.status;
end;
$$;

create or replace function public.update_customer_enquiry_confirmation(
  target_enquiry_id uuid,
  next_confirmation text
)
returns public.vendor_enquiries
language plpgsql
security definer
set search_path = ''
as $$
declare updated public.vendor_enquiries%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if next_confirmation not in ('contacted', 'cancelled', 'closed') then raise exception 'Invalid customer action'; end if;
  update public.vendor_enquiries
  set customer_confirmation = next_confirmation, updated_at = now()
  where id = target_enquiry_id and customer_id = auth.uid()
  returning * into updated;
  if updated.id is null then raise exception 'Enquiry not found'; end if;
  return updated;
end;
$$;

create or replace function public.update_vendor_enquiry(
  target_enquiry_id uuid,
  next_status text,
  notes text default null,
  follow_up_on date default null
)
returns public.vendor_enquiries
language plpgsql
security definer
set search_path = ''
as $$
declare updated public.vendor_enquiries%rowtype;
begin
  if next_status not in (
    'new', 'contacted', 'in_discussion', 'quotation_sent', 'follow_up',
    'booked', 'not_interested', 'invalid_lead', 'no_response', 'closed'
  ) then raise exception 'Invalid enquiry status'; end if;
  update public.vendor_enquiries e
  set status = next_status,
      vendor_notes = nullif(btrim(notes), ''),
      follow_up_date = follow_up_on,
      booking_confirmed = next_status = 'booked',
      updated_at = now()
  where e.id = target_enquiry_id
    and (private.workspace_vendor_owned(e.vendor_id) or private.is_admin())
  returning * into updated;
  if updated.id is null then raise exception 'Enquiry not found or access denied'; end if;
  return updated;
end;
$$;

create or replace function public.claim_guest_enquiries(guest_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare claimed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.vendor_enquiries
  set customer_id = auth.uid(), guest_session_id = null, updated_at = now()
  where guest_session_id = guest_id and customer_id is null;
  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

drop policy if exists "enquiries_customer_create" on public.vendor_enquiries;
drop policy if exists "enquiries_owner_update" on public.vendor_enquiries;
revoke insert, update, delete on public.vendor_enquiries from anon, authenticated;
grant select on public.vendor_enquiries to authenticated;
grant usage, select on sequence public.vendor_enquiry_reference_seq to authenticated;
grant execute on function public.create_tracked_enquiry(uuid,text,text,text,uuid,uuid,uuid,date,text,text,text) to anon, authenticated;
grant execute on function public.update_customer_enquiry_confirmation(uuid,text) to authenticated;
grant execute on function public.update_vendor_enquiry(uuid,text,text,date) to authenticated;
grant execute on function public.claim_guest_enquiries(uuid) to authenticated;

commit;
