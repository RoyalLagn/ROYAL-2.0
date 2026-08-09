begin;

-- The business now calls the ₹499 tier "Premium" and the ₹999 tier "Elite"
-- (previously seeded as "Silver" and "Standard/Premium"). This only renames
-- the existing plan rows in place -- ids, features, billing options, and
-- every vendor's existing subscription/plan_snapshot are untouched, so no
-- historical or active subscription is affected.

-- Free the 'premium' slug from the ₹999 tier first so the ₹499 tier can
-- claim it without a unique-slug collision.
update public.subscription_plans
set name = 'Elite', slug = 'elite'
where lower(slug) = 'premium';

update public.subscription_plans
set name = 'Premium', slug = 'premium'
where lower(slug) = 'silver';

commit;
