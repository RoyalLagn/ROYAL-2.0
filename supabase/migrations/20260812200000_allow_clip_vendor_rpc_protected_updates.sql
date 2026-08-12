-- The subscription-locking trigger replaced the earlier Clip protection
-- trigger but accidentally dropped the trusted app.clip_vendor_rpc bypass.
-- Restore that narrow bypass so ownership-checked SECURITY DEFINER RPCs can
-- soft-delete/replace a Vendor's Clip while ordinary direct updates remain
-- unable to change moderation, counters, publication, or deletion fields.
create or replace function private.protect_clip_moderation_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1
    and not private.is_admin()
    and coalesce(current_setting('app.clip_vendor_rpc', true), '') <> 'on'
    and coalesce(current_setting('app.subscription_media_reconcile', true), '') <> 'on'
    and (
      new.vendor_id is distinct from old.vendor_id
      or new.views_count is distinct from old.views_count
      or new.likes_count is distinct from old.likes_count
      or new.saves_count is distinct from old.saves_count
      or new.moderation_reason is distinct from old.moderation_reason
      or new.published_at is distinct from old.published_at
      or new.deleted_at is distinct from old.deleted_at
      or new.subscription_locked is distinct from old.subscription_locked
      or new.subscription_locked_at is distinct from old.subscription_locked_at
      or new.status not in ('draft', 'pending')
    )
  then
    raise exception 'Protected Clip fields may only be changed by the subscription system or an administrator';
  end if;
  return new;
end;
$$;
