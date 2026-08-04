begin;

-- Temporary: seed one test vendor with awards/languages/business_hours/FAQs
-- so the new /vendors/[slug] sections can be verified end-to-end. Reverted
-- by the follow-up migration once verification is complete.

update public.vendors
set
  awards = array['Best Wedding DJ 2025', 'Top Rated on RoyalLagn'],
  languages = array['English', 'Hindi', 'Marathi'],
  business_hours = '[
    {"day":1,"opens":"10:00","closes":"20:00","closed":false},
    {"day":2,"opens":"10:00","closes":"20:00","closed":false},
    {"day":3,"opens":"10:00","closes":"20:00","closed":false},
    {"day":4,"opens":"10:00","closes":"20:00","closed":false},
    {"day":5,"opens":"10:00","closes":"22:00","closed":false},
    {"day":6,"opens":"10:00","closes":"22:00","closed":false},
    {"day":0,"opens":"","closes":"","closed":true}
  ]'::jsonb
where slug = 'dj-wala-pune';

insert into public.vendor_faqs (vendor_id, question, answer, display_order)
select id, 'Do you provide your own equipment?', 'Yes, we bring professional sound and lighting equipment to every event.', 1
from public.vendors where slug = 'dj-wala-pune'
union all
select id, 'How far in advance should I book?', 'We recommend booking at least 4-6 weeks before your event date.', 2
from public.vendors where slug = 'dj-wala-pune';

commit;
