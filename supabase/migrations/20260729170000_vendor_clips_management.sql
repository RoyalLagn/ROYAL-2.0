begin;

create or replace function private.protect_clip_moderation_fields()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() = 1
     and current_setting('app.clip_vendor_rpc', true) is distinct from 'on'
     and not private.is_admin() and (
    new.vendor_id is distinct from old.vendor_id
    or new.views_count is distinct from old.views_count
    or new.likes_count is distinct from old.likes_count
    or new.saves_count is distinct from old.saves_count
    or new.moderation_reason is distinct from old.moderation_reason
    or new.published_at is distinct from old.published_at
    or new.deleted_at is distinct from old.deleted_at
    or (
      new.status is distinct from old.status
      and new.status not in ('draft', 'pending')
    )
  ) then
    raise exception 'Protected clip fields may only be changed by an administrator';
  end if;
  return new;
end;
$$;

create or replace function public.vendor_soft_delete_clip(target_clip_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare result_public_id text;
begin
  perform set_config('app.clip_vendor_rpc', 'on', true);
  update public.clips c
  set status = 'deleted', deleted_at = clock_timestamp(), visibility = 'private'
  where c.id = target_clip_id and private.owns_vendor(c.vendor_id) and c.deleted_at is null
  returning cloudinary_public_id into result_public_id;
  if result_public_id is null then raise exception 'Owned Clip not found'; end if;
  return result_public_id;
end;
$$;

create or replace function public.vendor_replace_oldest_clip(target_vendor_id uuid)
returns table (clip_id uuid, cloudinary_public_id text)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.owns_vendor(target_vendor_id) then raise exception 'Vendor ownership required'; end if;
  perform set_config('app.clip_vendor_rpc', 'on', true);
  return query
  update public.clips c
  set status = 'deleted', deleted_at = clock_timestamp(), visibility = 'private'
  where c.id = (
    select candidate.id from public.clips candidate
    where candidate.vendor_id = target_vendor_id
      and candidate.status = 'approved' and candidate.deleted_at is null
    order by candidate.published_at asc nulls last, candidate.created_at asc
    limit 1 for update
  )
  returning c.id, c.cloudinary_public_id;
end;
$$;

revoke all on function public.vendor_soft_delete_clip(uuid) from public, anon;
revoke all on function public.vendor_replace_oldest_clip(uuid) from public, anon;
grant execute on function public.vendor_soft_delete_clip(uuid) to authenticated;
grant execute on function public.vendor_replace_oldest_clip(uuid) to authenticated;

commit;
