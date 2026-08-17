begin;

-- Admin must be able to permanently delete a category even while vendors/
-- applications/clips/hero slides still reference it, without deleting or
-- corrupting that business data. Today all four foreign keys are NOT NULL +
-- ON DELETE RESTRICT, which makes Postgres reject the DELETE outright the
-- moment any row references the category — there is no non-destructive way
-- to satisfy "delete the category, keep the record" under that constraint.
--
-- The standard, non-destructive fix is exactly what it sounds like: make the
-- column nullable and change the FK to ON DELETE SET NULL. Deleting a used
-- category then un-tags the dependent rows (their category_id becomes NULL)
-- in the same transaction as the delete — the vendor, application, clip, or
-- hero slide row itself, and everything that references *it* (profiles,
-- portfolio, clips, reviews, enquiries, users), is completely untouched.
--
-- Reviewed before writing this: no RLS policy or SECURITY DEFINER function
-- requires vendors.category_id (or the other three) to be non-null to grant
-- access to that row's own owner — only read-side vendor *discovery* queries
-- (nearby/taluka/location search) INNER JOIN categories, so a vendor whose
-- category was removed this way will stop appearing in category-scoped
-- discovery results until an admin assigns it a new category, exactly the
-- "association removed, profile preserved" behavior this feature asks for.

alter table public.vendors alter column category_id drop not null;
alter table public.vendors drop constraint vendors_category_id_fkey;
alter table public.vendors add constraint vendors_category_id_fkey
  foreign key (category_id) references public.categories(id) on delete set null;

alter table public.vendor_applications alter column category_id drop not null;
alter table public.vendor_applications drop constraint vendor_applications_category_id_fkey;
alter table public.vendor_applications add constraint vendor_applications_category_id_fkey
  foreign key (category_id) references public.categories(id) on delete set null;

alter table public.clips alter column category_id drop not null;
alter table public.clips drop constraint clips_category_id_fkey;
alter table public.clips add constraint clips_category_id_fkey
  foreign key (category_id) references public.categories(id) on delete set null;

alter table public.hero_slides alter column category_id drop not null;
alter table public.hero_slides drop constraint hero_slides_category_id_fkey;
alter table public.hero_slides add constraint hero_slides_category_id_fkey
  foreign key (category_id) references public.categories(id) on delete set null;

-- No RLS change: public.categories already has categories_admin_delete
-- (private.is_admin()), which is all a plain client-side
-- `.from("categories").delete()` call needs once the FK behavior above
-- allows it to succeed for a referenced category.

commit;
