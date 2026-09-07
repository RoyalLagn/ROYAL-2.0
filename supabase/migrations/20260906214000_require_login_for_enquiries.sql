begin;

-- Enquiry creation produces vendor notifications and exposes external contact
-- actions. Keep enforcement at the database boundary as well as in the app.
revoke execute on function public.create_tracked_enquiry(
  uuid, text, text, text, uuid, uuid, uuid, date, text, text, text
) from public, anon;

grant execute on function public.create_tracked_enquiry(
  uuid, text, text, text, uuid, uuid, uuid, date, text, text, text
) to authenticated;

commit;
