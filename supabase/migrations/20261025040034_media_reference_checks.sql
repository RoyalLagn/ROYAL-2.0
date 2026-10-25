-- Applied as 20261025040034; read only media-reference columns.
-- No client grants or RLS policies change.
grant select (id, image_urls) on public.reviews to service_role;
