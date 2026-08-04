begin;

-- Reverts the temporary verification seed from
-- 20260804230000_seed_test_vendor_profile_content.sql now that the
-- /vendors/[slug] Phase 2 rebuild has been confirmed end-to-end.

update public.vendors
set awards = '{}', languages = '{}', business_hours = null
where slug = 'dj-wala-pune';

delete from public.vendor_faqs
where vendor_id = (select id from public.vendors where slug = 'dj-wala-pune');

commit;
