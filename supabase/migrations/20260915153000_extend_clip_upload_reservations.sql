begin;

-- A 20 MiB upload can legitimately spend up to 15 minutes transferring on a
-- slow mobile connection and several more minutes encoding in Bunny Stream.
-- Keep the atomic slot reservation alive for the complete supported pipeline.
alter table public.clip_upload_reservations
  alter column expires_at set default (now() + interval '45 minutes');

commit;
