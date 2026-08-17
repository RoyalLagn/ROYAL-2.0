begin;

-- public.categories had no uniqueness guarantee on slug or name (only a
-- primary key on id and a not-blank check on name) — verified no existing
-- duplicates before adding this. The admin "Add New Category" flow checks
-- for an existing name/slug client-side before inserting, but that check
-- alone can't prevent a race between two concurrent submissions; this index
-- is the authoritative, database-level guard (a 23505 unique violation) that
-- the flow surfaces as "Category already exists."
create unique index if not exists categories_slug_unique_idx
  on public.categories (lower(btrim(slug)));

commit;
