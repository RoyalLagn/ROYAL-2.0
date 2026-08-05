begin;

-- =========================================================================
-- Vendor Marketing Card
-- One premium, RoyalLagn-branded marketing card per vendor. Almost every
-- field it needs already lives on `vendors` (business_name, category,
-- logo_url, city, state, slug, contact_phone, contact_email, instagram,
-- website, experience) or is derived at read time (rating, review count,
-- portfolio hero image, permanent QR). This table only stores the small
-- handful of fields that genuinely don't exist anywhere else yet.
-- =========================================================================

create table if not exists public.vendor_marketing_cards (
  vendor_id uuid primary key references public.vendors(id) on delete cascade,
  whatsapp_number text,
  business_tagline text,
  happy_clients text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vendor_marketing_cards_whatsapp_not_blank check (whatsapp_number is null or btrim(whatsapp_number) <> ''),
  constraint vendor_marketing_cards_tagline_length check (business_tagline is null or char_length(business_tagline) <= 120),
  constraint vendor_marketing_cards_happy_clients_length check (happy_clients is null or char_length(happy_clients) <= 20)
);

create trigger vendor_marketing_cards_set_updated_at
before update on public.vendor_marketing_cards
for each row execute function private.set_updated_at();

alter table public.vendor_marketing_cards enable row level security;

grant select, insert, update on public.vendor_marketing_cards to authenticated;

-- Only the owning vendor (or an admin) may ever see or edit this row -- it
-- holds a personal WhatsApp number, so it is never publicly readable, unlike
-- vendors.slug/logo_url/etc which back the public profile.
create policy "vendor_marketing_cards_owner_or_admin_read"
on public.vendor_marketing_cards for select
to authenticated
using (
  (select private.owns_vendor(vendor_id))
  or (select private.is_admin())
);

create policy "vendor_marketing_cards_owner_insert"
on public.vendor_marketing_cards for insert
to authenticated
with check (private.owns_vendor(vendor_id));

create policy "vendor_marketing_cards_owner_update"
on public.vendor_marketing_cards for update
to authenticated
using (private.owns_vendor(vendor_id))
with check (private.owns_vendor(vendor_id));

commit;
