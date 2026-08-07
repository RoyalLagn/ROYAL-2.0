import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

// Vendor profile editing was split out of the old app/VendorEditProfile.tsx
// into one screen per section; the smoke test must check all of them so it
// still catches a screen that regresses to a stale/local update path.
const VENDOR_EDIT_SCREENS = [
  "app/VendorEditBusinessInfo.tsx",
  "app/VendorEditAbout.tsx",
  "app/VendorEditLocation.tsx",
  "app/VendorEditContact.tsx",
  "app/VendorEditBrand.tsx",
  "app/VendorEditTags.tsx",
];

const [
  publicAuth,
  customerEdit,
  customerProfile,
  vendorEditScreens,
  adminUsers,
  adminVendorService,
  realtimeMigration,
  vendorProfileService,
  vendorWorkspace,
  publicListings,
  profileSyncMigration,
  cloudinary,
  squareImageEditor,
  becomeVendor,
] = await Promise.all([
  read("services/publicAuth.ts"),
  read("app/EditProfile.tsx"),
  read("app/(tabs)/profile.tsx"),
  Promise.all(VENDOR_EDIT_SCREENS.map(read)),
  read("services/adminUsers.ts"),
  read("services/adminVendorService.ts"),
  read("supabase/migrations/20260730120000_enable_public_profile_realtime.sql"),
  read("services/vendorProfile.ts"),
  read("hooks/useVendorWorkspace.ts"),
  read("services/publicVendorListings.ts"),
  read("supabase/migrations/20260730130000_profile_sync_and_live_views.sql"),
  read("services/cloudinary.ts"),
  read("components/vendor/SquareImageEditor.tsx"),
  read("app/BecomeVendor.tsx"),
]);

assert.match(publicAuth, /from\("profiles"\)[\s\S]*?\.update\(payload\)/, "Customer updates must write to profiles.");
assert.match(publicAuth, /\.eq\("id", userId\)[\s\S]*?\.eq\("role", "public_user"\)/, "Customer updates must be scoped to the signed-in public user.");
assert.match(customerEdit, /updatePublicProfile\(session\.user\.id/, "Customer edit form must use the shared database updater.");
assert.match(customerEdit, /await refreshProfile\(\)/, "Customer edit form must refresh shared profile state.");
assert.match(customerProfile, /updatePublicProfile\(session\.user\.id, \{ profileImage: uploadedUrl \}\)/, "Customer photo upload must persist.");
assert.match(customerProfile, /updatePublicProfile\(session\.user\.id, \{ profileImage: null \}\)/, "Customer photo removal must persist.");
VENDOR_EDIT_SCREENS.forEach((path, index) => {
  const source = vendorEditScreens[index];
  assert.match(source, /updateVendorPublicProfile\(\{/, `${path} must use the shared vendor profile update service.`);
  assert.match(source, /invalidatePublicVendorCache\(\)/, `${path} must invalidate public marketplace data after saving.`);
});
assert.match(vendorProfileService, /rpc\("update_vendor_public_profile"/, "Vendor profile service must call the database synchronization RPC.");
assert.match(profileSyncMigration, /update public\.profiles[\s\S]*full_name = btrim\(new\.owner_name\)/, "Vendor owner identity must synchronize to profiles.");
assert.match(vendorWorkspace, /table: "vendors"[\s\S]*filter: `id=eq\.\$\{vendorId\}`/, "Vendor workspace must subscribe to live Vendor updates.");
assert.match(publicListings, /rpc\("record_vendor_profile_view"/, "Public Vendor pages must record profile views.");
assert.match(profileSyncMigration, /profile_views = v\.profile_views \+ 1/, "Profile views must be updated atomically.");
assert.match(cloudinary, /export async function pickProfileImage/, "Profile images must use the validated picker.");
assert.match(cloudinary, /export async function uploadProfileImage/, "Profile images must use the managed signed upload flow.");
assert.doesNotMatch(cloudinary, /pickAndUploadProfileImage/, "Profile uploads must not bypass the user-controlled crop editor.");
assert.match(squareImageEditor, /Math\.min\(frameSize \/ imageSize\.width, frameSize \/ imageSize\.height\)/, "The square editor must fit the complete source image by default.");
assert.match(squareImageEditor, /captureRef\(canvasRef,[\s\S]*?width: PROFILE_IMAGE_SIZE,[\s\S]*?height: PROFILE_IMAGE_SIZE/, "The square editor preview must be the exact 1024 by 1024 saved output.");
assert.match(squareImageEditor, /async function renderWebSquare[\s\S]*?canvas\.toBlob/, "Web profile images must encode through the direct canvas path.");
assert.match(squareImageEditor, /Platform\.OS === "web"[\s\S]*?renderWebSquare\(/, "Web profile images must avoid slow DOM capture.");
assert.match(customerEdit, /<SquareImageEditor[\s\S]*?kind="profile"/, "Customer Edit Profile must use the square editor.");
assert.match(customerProfile, /<SquareImageEditor[\s\S]*?kind="profile"/, "Customer Profile must use the square editor.");
assert.match(vendorEditScreens[VENDOR_EDIT_SCREENS.indexOf("app\/VendorEditBrand.tsx")], /<SquareImageEditor[\s\S]*?kind="logo"/, "Vendor brand editing must use the square editor.");
assert.match(becomeVendor, /<SquareImageEditor[\s\S]*?kind="logo"/, "Vendor onboarding must use the square editor.");
assert.match(cloudinary, /deleteManagedProfileImage/, "Replaced profile images must support managed deletion.");
assert.match(adminUsers, /from\("profiles"\)/, "Admin users must read live profile records.");
assert.match(adminUsers, /table: "profiles"/, "Admin users must subscribe to profile changes.");
assert.match(adminVendorService, /"vendors"[\s\S]*AdminVendorService\.invalidate|AdminVendorService/, "Admin vendor service must remain connected.");
assert.match(realtimeMigration, /alter publication supabase_realtime add table public\.profiles/, "Profiles must be published to Supabase realtime.");

console.log(`Profile propagation smoke test passed (${VENDOR_EDIT_SCREENS.length} vendor edit screens checked).`);
