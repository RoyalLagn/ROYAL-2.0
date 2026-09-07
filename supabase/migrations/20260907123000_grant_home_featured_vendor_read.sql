-- RLS decides which rows public clients may read; table privileges must also
-- permit the SELECT operation before those policies can be evaluated.
grant select on table public.home_featured_vendors to anon, authenticated;

