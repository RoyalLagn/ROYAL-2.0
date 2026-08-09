begin;

alter table public.vendor_portfolio_media
  drop constraint if exists vendor_portfolio_media_optimized_size_check,
  add constraint vendor_portfolio_media_optimized_size_check
    check (
      optimized_size_bytes is null
      or (resource_type = 'image' and optimized_size_bytes <= 5242880)
      or (resource_type = 'video' and optimized_size_bytes <= 26214400)
    ) not valid;

-- Existing assets were accepted under the previous limit. The new rule is
-- enforced for new and updated rows without invalidating historical records.

commit;
