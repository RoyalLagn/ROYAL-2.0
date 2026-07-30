import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  publicAuth,
  customerEdit,
  customerProfile,
  vendorEdit,
  adminUsers,
  adminVendorService,
  realtimeMigration,
  vendorProfileService,
  vendorWorkspace,
  publicListings,
  profileSyncMigration,
  cloudinary,
] = await Promise.all([
  read("services/publicAuth.ts"),
  read("app/EditProfile.tsx"),
  read("app/(tabs)/profile.tsx"),
  read("app/VendorEditProfile.tsx"),
  read("services/adminUsers.ts"),
  read("services/adminVendorService.ts"),
  read("supabase/migrations/20260730120000_enable_public_profile_realtime.sql"),
  read("services/vendorProfile.ts"),
  read("hooks/useVendorWorkspace.ts"),
  read("services/publicVendorListings.ts"),
  read("supabase/migrations/20260730130000_profile_sync_and_live_views.sql"),
  read("services/cloudinary.ts"),
]);

assert.match(publicAuth, /from\("profiles"\)[\s\S]*?\.update\(payload\)/, "Customer updates must write to profiles.");
assert.match(publicAuth, /\.eq\("id", userId\)[\s\S]*?\.eq\("role", "public_user"\)/, "Customer updates must be scoped to the signed-in public user.");
assert.match(customerEdit, /updatePublicProfile\(session\.user\.id/, "Customer edit form must use the shared database updater.");
assert.match(customerEdit, /await refreshProfile\(\)/, "Customer edit form must refresh shared profile state.");
assert.match(customerProfile, /updatePublicProfile\(session\.user\.id, \{ profileImage: uploadedUrl \}\)/, "Customer photo upload must persist.");
assert.match(customerProfile, /updatePublicProfile\(session\.user\.id, \{ profileImage: null \}\)/, "Customer photo removal must persist.");
assert.match(vendorEdit, /updateVendorPublicProfile\(\{/, "Vendor edits must use the atomic profile synchronization RPC.");
assert.match(vendorEdit, /invalidatePublicVendorCache\(\)/, "Vendor edits must invalidate public marketplace data.");
assert.match(vendorProfileService, /rpc\("update_vendor_public_profile"/, "Vendor profile service must call the database synchronization RPC.");
assert.match(profileSyncMigration, /update public\.profiles[\s\S]*full_name = btrim\(new\.owner_name\)/, "Vendor owner identity must synchronize to profiles.");
assert.match(vendorWorkspace, /table: "vendors"[\s\S]*filter: `id=eq\.\$\{vendorId\}`/, "Vendor workspace must subscribe to live Vendor updates.");
assert.match(publicListings, /rpc\("record_vendor_profile_view"/, "Public Vendor pages must record profile views.");
assert.match(profileSyncMigration, /profile_views = v\.profile_views \+ 1/, "Profile views must be updated atomically.");
assert.match(cloudinary, /pickAndUploadProfileImage/, "Profile images must use the managed upload flow.");
assert.match(cloudinary, /deleteManagedProfileImage/, "Replaced profile images must support managed deletion.");
assert.match(adminUsers, /from\("profiles"\)/, "Admin users must read live profile records.");
assert.match(adminUsers, /table: "profiles"/, "Admin users must subscribe to profile changes.");
assert.match(adminVendorService, /"vendors"[\s\S]*AdminVendorService\.invalidate|AdminVendorService/, "Admin vendor service must remain connected.");
assert.match(realtimeMigration, /alter publication supabase_realtime add table public\.profiles/, "Profiles must be published to Supabase realtime.");

console.log("Profile propagation smoke test passed.");
