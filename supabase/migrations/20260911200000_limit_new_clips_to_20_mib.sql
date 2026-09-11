-- Uploaded Clip media is locally compressed before Cloudinary signing. Keep
-- this database constraint aligned with that server-side contract while
-- retaining older rows unchanged.
alter table public.clips
  drop constraint if exists clips_file_size_valid;

alter table public.clips
  add constraint clips_file_size_valid
  check (file_size_bytes > 0 and file_size_bytes <= 20971520) not valid;
