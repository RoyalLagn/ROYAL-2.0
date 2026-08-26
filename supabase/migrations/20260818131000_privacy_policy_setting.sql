insert into public.application_settings (
  key,
  value,
  value_type,
  description,
  is_public
)
values (
  'privacy_policy',
  jsonb_build_object(
    'content',
    E'# RoyalLagn Privacy Policy\n\n**Effective date:** [EFFECTIVE DATE]\n\nRoyalLagn is a wedding-vendor discovery platform. This policy explains how we collect and use personal information when you use our app, website, and related services.\n\n## Information We Collect\n\nWe collect information you provide, including your name, email address, phone number, profile details, favourites, reviews, enquiry messages, event details, and support requests. Vendors may also provide business details, packages, pricing, portfolio media, verification documents, and subscription information.\n\nWe may collect limited usage and device information, such as app activity, notification token, IP address, and device type, to operate and secure the service. If you choose **Near Me**, we use your device location only to show relevant nearby vendors; you can instead select a location manually.\n\n## How We Use Information\n\nWe use your information to provide and improve RoyalLagn, create and protect accounts, display vendor listings, manage enquiries, process vendor subscriptions, send service notifications, respond to support requests, prevent fraud or misuse, and meet legal obligations.\n\n## When We Share Information\n\nVendor profiles, portfolios, reviews, and other content you choose to publish may be visible to other users. When you submit an enquiry, the relevant contact and event information is shared with the vendor you select.\n\nWe use trusted service providers to run RoyalLagn, including Supabase for authentication and data storage, Cloudinary for media hosting, Razorpay for vendor subscription payments, and Expo for push notifications. These providers process information only as needed to provide their services. We may also disclose information when required by law or to protect RoyalLagn, our users, or the public.\n\nRoyalLagn does not sell your personal information or use it for cross-app advertising.\n\n## Your Choices\n\nYou can update your profile, manage favourites and reviews where available, choose a manual location, disable location or notification permissions in your device settings, and log out at any time. To request access, correction, or deletion of your information, contact us at [PRIVACY EMAIL]. Some information may be retained where required for payments, legal compliance, security, or dispute resolution.\n\n## Security and Retention\n\nWe use reasonable technical and organisational safeguards to protect information. No system is completely secure. We keep information only for as long as needed for the purposes above, unless a longer period is required by law.\n\n## Children’s Privacy\n\nRoyalLagn is not intended for children under [MINIMUM AGE]. If you believe a child has provided us personal information, please contact us at [PRIVACY EMAIL].\n\n## Changes and Contact\n\nWe may update this policy from time to time. The latest version will be available in the RoyalLagn app and on our website. For privacy questions, contact [LEGAL ENTITY NAME] at [PRIVACY EMAIL].'
  ),
  'json',
  'Public RoyalLagn Privacy Policy managed from the admin workspace.',
  true
)
on conflict (key) do nothing;

create or replace function public.update_privacy_policy(target_content text)
returns table (value jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_content text := btrim(target_content);
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text in ('admin', 'super_admin')
      and is_active
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if normalized_content = '' then
    raise exception 'Privacy Policy cannot be empty' using errcode = '22023';
  end if;

  return query
  insert into public.application_settings (
    key,
    value,
    value_type,
    description,
    is_public,
    updated_by
  )
  values (
    'privacy_policy',
    jsonb_build_object('content', normalized_content),
    'json',
    'Public RoyalLagn Privacy Policy managed from the admin workspace.',
    true,
    auth.uid()
  )
  on conflict (key) do update set
    value = excluded.value,
    value_type = excluded.value_type,
    description = excluded.description,
    is_public = true,
    updated_by = excluded.updated_by
  returning application_settings.value, application_settings.updated_at;
end;
$$;

revoke all on function public.update_privacy_policy(text) from public, anon;
grant execute on function public.update_privacy_policy(text) to authenticated;
