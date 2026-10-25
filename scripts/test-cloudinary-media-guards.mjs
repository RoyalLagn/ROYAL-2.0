import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [mediaService, cloudinary, portfolioSigner, profileImage, reviewSigner, portfolioDelete, reviewDelete, adminDelete, userDelete, exampleEnv, marketplace] = await Promise.all([
  read("services/media.ts"),
  read("services/cloudinary.ts"),
  read("supabase/functions/portfolio-media-sign/index.ts"),
  read("supabase/functions/profile-image/index.ts"),
  read("supabase/functions/review-photo-sign/index.ts"),
  read("supabase/functions/portfolio-media-delete/index.ts"),
  read("supabase/functions/review-photo-delete/index.ts"),
  read("supabase/functions/admin-media-delete/index.ts"),
  read("supabase/functions/user-media-delete/index.ts"),
  read(".env.example"),
  read("data/marketplaceCategories.ts"),
]);

for (const [name, source] of [["media service", mediaService], ["portfolio delete", portfolioDelete], ["profile image", profileImage], ["review delete", reviewDelete], ["admin delete", adminDelete], ["user delete", userDelete], ["env example", exampleEnv]]) {
  assert.doesNotMatch(source, /bunny|b-cdn\.net/i, `${name} must remain Cloudinary-only.`);
}
assert.match(marketplace, /categoryImages\.cloudinary\.json/, "Marketplace category cards must use Cloudinary URLs.");
assert.match(mediaService, /admin-media-delete/, "Admin image deletion must call the Cloudinary admin-media-delete function.");
assert.match(mediaService, /user-media-delete/, "Owned upload deletion must call the Cloudinary user-media-delete function.");

assert.match(cloudinary, /api_key[\s\S]*timestamp[\s\S]*signature/, "Cloudinary uploads must support Edge Function signed credentials.");
assert.match(mediaService, /profile-image[\s\S]*cloudinarySignedOptions/, "Profile uploads must be authorized by Supabase before Cloudinary upload.");
assert.match(mediaService, /review-photo-sign[\s\S]*cloudinarySignedOptions/, "Review uploads must be authorized by Supabase before Cloudinary upload.");
assert.match(mediaService, /portfolio-media-sign[\s\S]*cloudinarySignedOptions/, "Portfolio uploads must use the Supabase-issued Cloudinary signature.");
for (const source of [portfolioSigner, profileImage, reviewSigner]) {
  assert.match(source, /CLOUDINARY_API_SECRET/, "Upload signer must use the server-side Cloudinary secret.");
  assert.match(source, /uploadMode: "signed"/, "Upload signer must return signed Cloudinary authorization.");
}
for (const source of [portfolioDelete, reviewDelete, profileImage, adminDelete, userDelete]) {
  assert.match(source, /CLOUDINARY_API_SECRET|cloudinaryAdmin/, "Cloudinary deletions must use server-side credentials.");
}
for (const key of ["EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME", "EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET"]) {
  assert.match(exampleEnv, new RegExp(`^${key}=`, "m"), `.env.example must document ${key}.`);
}

console.log("Cloudinary media integration guards passed.");
