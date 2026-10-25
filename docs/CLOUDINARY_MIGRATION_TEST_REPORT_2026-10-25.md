# Cloudinary + Supabase implementation and live test report

Date: 25 October 2026. Target: RoyalLagn production Supabase project `fymdrjcinqvmjthdwrtd`, tested through `http://localhost:8081`.

## Outcome

Implemented and deployed Cloudinary upload/deletion fixes, removed obsolete local services and dependencies, and executed real browser uploads against Cloudinary and Supabase. **The complete migration is not finished.** Existing inaccessible media, PDF delivery restrictions, a restricted vendor-logo replacement test, and incomplete reconciliation of early interrupted draft uploads remain.

Existing customer/vendor records and media were preserved. Historical migrations and recovery backups were not erased. The working tree already contained migration changes when this run began; this work continued those changes without resetting the checkout.

## Executed results

“Pass” below applies only to the operations described, not to every historical asset.

| Workflow | Browser test | Cloudinary | Supabase | Final status |
| --- | --- | --- | --- | --- |
| Admin hero images | Created labeled slide, refreshed, replaced image; desktop and 390px mobile image loaded | Signed upload 200; both replaced/deleted test assets returned 404 | Correct URLs saved; dummy slide removed | Pass for new media; existing legacy hero unresolved |
| Vendor profile | Uploaded/cropped logo draft and displayed it; did not save over the real logo | Signed upload succeeded; identified draft deleted through profile function | Original saved logo verified unchanged | Partial: saved replacement/persistence not executed |
| Portfolio albums | Created labeled album, refreshed, previewed, deleted | Remaining assets destroyed during album deletion | Album and all three test media rows removed | Pass |
| Multiple photo uploads | Two labeled PNGs selected in the same batch; displayed and persisted | Both uploads 200; both deleted files returned 404 | Two finalized image records; counts refreshed | Pass |
| Videos and clips | Retried corrected animated WebM; actual playback advanced beyond 0.4s, duration 1.938743s, readyState 4 | Video upload 200; deletion verified 404 | Video finalized and later removed | Portfolio video pass; clips remain disabled and return 410 |
| Categories | Two-image creation, refresh; corrected display retested at 1440px and 390px | Uploads 200; latest deleted test images returned 404; all 15 fallback URLs return 200 | Both icon and fallback URLs persisted; dummy categories removed | Pass after fixes |
| Customer profile | Temporary customer logged in; uploaded, refreshed, replaced, removed photo | Uploads succeeded; both image URLs later returned 404 | Image URL updated, then null; temporary account removed | Pass after auth-loading fix |
| Review images | Temporary customer uploaded two photos; saved, refreshed, removed one at mobile width, deleted review | All six captured profile/review draft and saved-image uploads verified 404 after cleanup | Review photos persisted; edited to one; review removed | Pass |
| Media replacement/deletion | Hero, category, customer profile, review, individual portfolio photo and album exercised | Deletion responses validated; saved/shared reference deletion refused | References cleared or rows deleted as appropriate | Pass for tested paths; universal orphan-free state not proven |
| Bunny cleanup | Local app uses Cloudinary; live database and deployed resources inspected | Ten legacy source reads returned 404 through authenticated recovery; public legacy hero returned 403 | Empty finance table and obsolete migration RPC removed; legacy records retained | Incomplete: recovery dependencies remain |
| Business documents | Real browser HTTP API test, not onboarding UI | Signed raw PDF upload 200; delivery 401 `deny or ACL failure`; owned deletion 200 | No application/document record created | Blocked on delivery; full UI/persistence not tested |

## Bugs fixed

- Review client validation rejected Cloudinary URLs and accepted only the old CDN.
- Review photo helpers were unreachable from the form. Added matching photo controls, upload state, removal, and draft cleanup.
- Some deletion functions acknowledged success without API credentials or without validating Cloudinary's deletion response. They now fail rather than silently remove metadata.
- General/admin/application/document uploads bypassed Supabase signatures. Added authenticated `media-upload-sign` with server-selected ownership folders and file validation.
- The image upload helper ignored the raw resource type, sending PDFs to the image endpoint. It now uses the requested resource endpoint and preserves raw public-ID extensions.
- Document delivery failures could become broken saved links. Client document uploads now check delivery and remove the uploaded file before reporting a configuration error.
- The customer auth provider could finish loading an older request before the latest profile request, redirecting the editor away. Loading now follows the current request sequence. Customer upload/refresh was retested successfully.
- Category Save could run before an image upload finished. The action now remains disabled during either upload.
- Category presentation could prefer bundled images/icons over uploaded fallback media. Uploaded media now participates in the correct fallback order. Desktop/mobile retest passed.
- Added draft cleanup to hero/category/vendor-logo editors and cancellation of failed portfolio reservations.
- Hardened Cloudinary host/cloud validation and added upload timeouts.
- Added saved/shared-reference checks before general/admin deletion. Fixed the JSON containment query and granted only the server columns needed for review-media checks.
- Legacy clip deletion identities now remain pending instead of being falsely acknowledged as deleted.

## Live database changes

Applied and verified, with local filenames reconciled to the actual remote migration versions:

1. `supabase/migrations/20261025033952_cloudinary_media_cleanup.sql`
   - Guarded emptiness check, then removed `finance_bunny_usage` without CASCADE.
   - Removed obsolete `finalize_bunny_clip_migration(uuid,text,text,text)`.
   - Restricted review URL validation to this project's Cloudinary image path.
   - Preserved existing review rows and validated their constraint.
2. `supabase/migrations/20261025040034_media_reference_checks.sql`
   - Granted service-role SELECT on only `reviews.id` and `reviews.image_urls` for reference checks.
   - Did not broaden client permissions or change RLS policies.

Existing media URL migration count in this run: **zero**. No inaccessible legacy reference was replaced with an invented or unrelated URL.

## Edge Functions deployed

`media-upload-sign`, `admin-media-delete`, `user-media-delete`, `profile-image`, `portfolio-media-sign`, `portfolio-media-delete`, `review-photo-sign`, `review-photo-delete`, `clip-upload-sign`, `clip-media-delete`, `admin-delete-clip`, `process-subscription-lifecycle`, `admin-process-vendor-deletion`, `delete-customer-account`.

A temporary administrator-only recovery function was deployed, attempted authenticated source reads, and was then removed. The broader inventory variant was rejected before deployment and was not installed.

## Main source changes

- Media: `services/media.ts`, `services/cloudinary.ts`, `services/reviews.ts`, `services/CategoryService.ts`, `utils/mediaDelivery.ts`, `components/SafeImage.tsx`, `components/vendor/PortfolioVideoPlayer.tsx`.
- Workflows: `app/AdminHero.tsx`, `app/AdminCategories.tsx`, `app/BecomeVendor.tsx`, `app/VendorEditBrand.tsx`, `context/PublicAuthContext.tsx`, `components/reviews/ReviewForm.tsx`, `components/reviews/ConnectedVendorReviews.tsx`, `components/reviews/VendorReviewsSection.tsx`.
- Delivery: `components/categories/CategoryCard.tsx`, `components/home/HeroSlideMedia.tsx`, `components/home/HomeCategoryCard.tsx`, `data/marketplaceCategories.ts`, `data/categoryImages.cloudinary.json`.
- Admin cleanup: dashboard alerts/services/types, finance service/types/revenue UI, legal media-provider wording.
- Backend: shared Cloudinary signing/deletion helpers, shared clip deletion helper, the functions listed above, `supabase/config.toml`, and the two new migrations.
- Configuration/dependencies: `.env.example`, `.gitignore`, `package.json`, `package-lock.json`; removed `tus-js-client` and its now-unused transitive dependencies.
- Removed obsolete local storage/stream services, CDN category JSON, upload scripts, duplicate old-provider delete-function sources, and obsolete migration utility. Historical applied migrations were retained.
- Updated documentation and existing regression guards for the requested review-photo workflow.

Reusable live-test scripts: `scripts/media-e2e-fixtures.js`, `scripts/e2e-customer-media.mjs`, `scripts/e2e-admin-category-media.mjs`, `scripts/e2e-document-media.mjs`, `scripts/cleanup-media-e2e.mjs`. No supplied account passwords were added to source files. Local generated credentials were private and blanked after dummy-account deletion.

## Negative tests and verification

Executed against deployed functions from the browser:

- Unauthenticated profile signer: **401**.
- Invalid portfolio MIME: **400**, unsupported file type.
- Signing for another vendor: **400**, vendor profile not found.
- Vendor calling admin deletion: **400**, admin access required.
- Deleting a saved category image: **400**, saved reference preserved.
- Disabled clips upload: **410**.
- Failed video reservations: two **cancelled**; successful reservations **completed**. No broken portfolio row was created for the invalid video fixture.

`npm run test:smoke`, `npm run test:cloudinary-media`, TypeScript `--noEmit`, and `git diff --check` passed. Full lint reported six errors and existing warnings in unrelated components; it is not reported as passing.

Supabase security advisors were inspected. Existing warnings include mutable search paths in unrelated booking/referral functions, externally callable security-definer functions, and disabled leaked-password protection. These were not silently changed as part of media migration.

## Cleanup verified

- Zero labeled dummy categories, albums, portfolio media, review rows, or temporary customer profiles remain in Supabase.
- Original vendor logo reference remained unchanged throughout the tests.
- The three portfolio test assets, two customer profile assets, four captured review assets, completed hero assets, and latest category test assets were deleted; their public image/video URLs were verified as 404 where delivery permitted that check.
- Dummy raw PDFs were deleted through the verified server API. PDF delivery itself remained blocked by the account.
- The temporary customer was globally signed out, then deleted after checking its known media and reviews were gone.
- Earlier interrupted unsaved admin uploads were not completely reconciled. Some upload IDs were lost across development reloads, so **do not claim all dummy Cloudinary orphans are absent**.

## Remaining blockers and next actions

1. **Recover existing files.** Nine portfolio records and one hero slide still reference inaccessible legacy files. Public delivery returned 403; authenticated recovery returned 404. Obtain the original files or working storage access. Three historical clip cleanup jobs also remain. Their records were preserved.
2. **Complete decommissioning only after recovery and client rollout checks.** Five old-provider functions and eight old-provider secrets remain deployed. Clip/outbox/deletion-log schema identities and immutable historical migration references remain. Removing them now would discard recovery paths or assume older clients no longer use them.
3. **Enable PDF delivery or choose an approved document-delivery design.** The real test returned 401. Cloudinary documents the PDF/ZIP delivery control under product-environment Security settings: https://cloudinary.com/documentation/image_delivery_options#blocked_delivery_formats_for_security . Account access/settings changes were not available in this run. The new client guard prevents saving an inaccessible document URL.
4. **Vendor saved-logo test was not executed.** Automatic review rejected replacing a real vendor logo because the attempted service-role restore setup lacked UPDATE permission. A safer unsaved upload/deletion test passed, and the original reference was verified unchanged. Complete this test with a dedicated vendor fixture or an approved, verified restoration path.
5. **Reconcile early dummy orphans.** Automatic review rejected a persistent broad Cloudinary inventory endpoint because it could expose unrelated media. It was not deployed. Use an approved narrow reconciliation method tied to fixture hashes/identifiable test media; never bulk-delete by creation date.

The local app changes are not a released mobile/web build. Account deletion paths were deployed but were not exercised against real accounts. No production customer/vendor account was deleted.
# Follow-up: authorized Bunny retirement — 25 October 2026

This follow-up supersedes the earlier decision to retain the five Bunny Edge Functions, eight secrets, nine portfolio rows, one hero row and three legacy deletion jobs. The user subsequently explicitly authorized removing old Bunny keys, functions and data.

- Saved private, ignored local JSON snapshots of the targeted media, hero, jobs and affected album relationships before deletion. No secret values were backed up.
- Deleted nine portfolio media rows whose source was `https://royallagnmedia.b-cdn.net/`, one hero slide using that source and three outbox jobs with `bunny:` asset identifiers. Existing albums and vendor/customer accounts were retained.
- Deleted deployed functions `bunny-media-sign`, `bunny-stream-upload`, `bunny-stream-status`, `admin-bunny-media-delete`, `bunny-user-media-delete`.
- Unset all eight `BUNNY_STORAGE_*` and `BUNNY_STREAM_*` secrets found in the project. A fresh CLI listing confirmed zero Bunny functions and zero Bunny secrets; all four Cloudinary secrets remain.
- Follow-up SQL confirmed zero Bunny URLs in live portfolio, hero, profile, vendor, category, application and review rows; zero legacy Bunny deletion jobs; all seven preexisting Cloudinary portfolio media rows remain. All four album counts equal their actual media counts, and deleted cover references are null. Two retained albums are now empty.
- No DDL or new schema migration was needed for this follow-up. Historical migrations, recovery backups and legacy `bunny_asset_id` column names remain for migration history and deployed database/client compatibility; they do not represent active Bunny service credentials.
- This was a Supabase retirement operation. It does not revoke the original credentials at Bunny or delete objects/zones/libraries inside the Bunny account. No authenticated Bunny account/API access was available for that verification. Removing Supabase secrets is not equivalent to revoking keys at their issuing service.
- No new browser upload test was executed during this follow-up. Earlier executed media workflow results below remain subject to their stated limits, including the PDF delivery setting.

