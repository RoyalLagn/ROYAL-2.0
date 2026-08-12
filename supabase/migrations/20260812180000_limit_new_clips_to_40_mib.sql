-- Preserve existing Clip rows while enforcing the 40 MiB limit for every
-- newly inserted or subsequently updated row.
alter table public.clips
  drop constraint if exists clips_file_size_valid;

alter table public.clips
  add constraint clips_file_size_valid
  check (file_size_bytes > 0 and file_size_bytes <= 41943040)
  not valid;
