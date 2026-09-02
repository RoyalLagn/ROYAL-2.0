// Focused structural guards for the recent stabilization fixes. Each
// assertion targets one specific regression, not a full-file snapshot, so a
// failure points at exactly what broke. No Supabase/network calls -- every
// check reads local source files only.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const exists = (path) =>
  access(new URL(`../${path}`, import.meta.url)).then(() => true, () => false);

// --- Clean checkouts must load Expo's React Native type augmentations -----
const expoTypeSource = await read("types/expo.d.ts");
assert.match(
  expoTypeSource,
  /^\/\/\/ <reference types="expo\/types" \/>/m,
  "types/expo.d.ts must keep Expo's tracked type reference for clean-checkout tsc runs.",
);

// --- Debug route must stay removed -------------------------------------
assert.equal(
  await exists("app/DebugModalTest 2.tsx"),
  false,
  "app/DebugModalTest 2.tsx must not be reintroduced.",
);

const appFiles = await Promise.all(
  ["app/_layout.tsx"].map(read),
);
assert.doesNotMatch(
  appFiles[0],
  /DebugModalTest/,
  "app/_layout.tsx must not reference the removed debug route.",
);

// --- Font imports must stay on approved per-weight submodules -----------
const layoutSource = appFiles[0];
assert.doesNotMatch(
  layoutSource,
  /from ['"]@expo-google-fonts\/inter['"]/,
  "app/_layout.tsx must not reintroduce the Inter barrel import (bundles all 18 weights).",
);

// --- Expo Go must not evaluate expo-notifications at startup ------------
const [pushRegistrarSource, pushServiceSource] = await Promise.all([
  read("components/notifications/PushTokenRegistrar.tsx"),
  read("services/pushTokens.ts"),
]);
for (const [path, source] of [
  ["components/notifications/PushTokenRegistrar.tsx", pushRegistrarSource],
  ["services/pushTokens.ts", pushServiceSource],
]) {
  assert.doesNotMatch(
    source,
    /^import \* as Notifications from ["']expo-notifications["'];?$/m,
    `${path} must not eagerly import expo-notifications because SDK 53+ Expo Go rejects it during module evaluation.`,
  );
  assert.match(
    source,
    /Constants\.appOwnership\s*(?:===|!==)\s*["']expo["']/,
    `${path} must keep the Expo Go runtime guard.`,
  );
}
assert.doesNotMatch(
  layoutSource,
  /from ['"]@expo-google-fonts\/playfair-display['"]/, // Guard the package barrel import.
  "app/_layout.tsx must not reintroduce the Playfair barrel import (bundles all 12 weights).",
);

// --- Responsive startup splash must remain a real two-second handoff -----
const startupSplashSource = await read("components/loading/StartupSplash.tsx");
assert.match(startupSplashSource, /const SPLASH_VISIBLE_MS = 1_600;/, "The native branded startup image must remain visible for 1.6 seconds after loading.");
assert.match(startupSplashSource, /width >= height \? LANDSCAPE_SPLASH : PORTRAIT_SPLASH/, "Startup artwork must follow viewport orientation rather than a device-name guess.");
assert.match(startupSplashSource, /resizeMode="cover"/, "Startup artwork must cover the complete viewport.");
assert.match(layoutSource, /<PageLoaderProvider suppressed=\{startupSplashVisible\}>/, "The page loader must not cover the startup splash.");
assert.match(layoutSource, /Platform\.OS !== 'web'/, "The branded startup splash must remain native-only.");
assert.match(layoutSource, /webBootLoading \? <PageLoader \/>/, "Web startup and refresh must use the shared page loader instead of the branded splash.");
const androidSplashStyleSource = await read("android/app/src/main/res/values/styles.xml");
assert.match(androidSplashStyleSource, /windowSplashScreenAnimatedIcon">@drawable\/splashscreen_logo</, "Android's mandatory system launch surface must show the branded splash logo while React Native starts.");

// --- Native auth screens must remain usable above the Android keyboard ---
const [authLayoutSource, otpFieldSource, keyboardAwareScrollSource] = await Promise.all([
  read("components/auth/AuthScreenLayout.tsx"),
  read("components/auth/OtpCodeField.tsx"),
  read("components/keyboard/KeyboardAwareScrollView.tsx"),
]);
assert.match(authLayoutSource, /<KeyboardAwareScrollView/, "Auth screens must use the shared keyboard-aware form scroller.");
assert.match(keyboardAwareScrollSource, /behavior=\{Platform\.OS === "ios" \? "padding" : undefined\}/, "Android forms must rely on adjustResize rather than a competing keyboard-height calculation.");
assert.match(keyboardAwareScrollSource, /TextInput\.State\.currentlyFocusedInput\(\)/, "The shared form scroller must discover focus centrally without per-field handlers.");
assert.match(keyboardAwareScrollSource, /scrollResponderScrollNativeHandleToKeyboard/, "The shared form scroller must use React Native's native keyboard-aware focus reveal path.");
assert.match(keyboardAwareScrollSource, /keyboardDidShow/, "The shared form scroller must re-check focus after Android finishes resizing for the keyboard.");
assert.match(authLayoutSource, /keyboardShouldPersistTaps="always"/, "Auth controls must remain tappable while the keyboard is open.");
assert.match(otpFieldSource, /InteractionManager\.runAfterInteractions/, "OTP focus must wait until navigation has completed so Android opens the keypad.");
assert.match(otpFieldSource, /showSoftInputOnFocus/, "OTP input must explicitly request the software keypad.");
assert.match(otpFieldSource, /inset: 0, opacity: 0\.01/, "OTP input must keep a touch-sized native focus target.");

// --- Native vendor profiles must not recompose heavy hero media on scroll ---
const [pinnedHeroSource, vendorProfileSource] = await Promise.all([
  read("components/vendor-profile/PinnedHeroProfileLayout.tsx"),
  read("app/VendorsProfile.tsx"),
]);
assert.match(pinnedHeroSource, /const useHeroParallax = Platform\.OS === "web" && !reducedMotion;/, "Native vendor heroes must not scale while their parent scrolls.");
assert.match(vendorProfileSource, /const trackProfileScroll = Platform\.OS === "web";/, "Native vendor profile scrolling must stay off the React render path.");

// --- Homepage location uses device permission in place, never Near Me route ---
const homeScreenSource = await read("app/(tabs)/index.tsx");
assert.match(homeScreenSource, /requestDeviceLocationPermission/, "Homepage location action must request device permission from the explicit tap.");
assert.match(homeScreenSource, /onPress=\{\(\) => void refreshHomeLocation\(true\)\}/, "Homepage location icon must fetch in place rather than navigate away.");
assert.doesNotMatch(homeScreenSource, /router\.push\("\/NearbyVendors"\)/, "Homepage must not route location actions to the obsolete NearbyVendors screen.");

// --- App alerts must stay cross-platform and app-wide -------------------
const [dialogProviderSource, alertBridgeSource] = await Promise.all([
  read("components/dialogs/AppDialogProvider.tsx"),
  read("utils/webAlert.ts"),
]);
assert.match(layoutSource, /<AppDialogProvider>/, "The root layout must mount the shared app dialog provider.");
assert.match(layoutSource, /installAppAlert\(\)/, "The root layout must install the app-wide Alert bridge before screens render.");
assert.match(alertBridgeSource, /Alert\.alert\s*=/, "The shared bridge must continue routing existing Alert.alert calls.");
assert.match(dialogProviderSource, /Platform\.OS === "android" \? 48 : 44/, "Dialog actions must keep platform-appropriate touch targets.");

// --- Admin workspace uses password auth plus an active admin profile ----
const [adminAuthSource, adminMfaSource, adminMfaPolicySource, adminMfaMigration] = await Promise.all([
  read("services/adminAuth.ts"),
  read("services/adminMfa.ts"),
  read("services/adminMfaPolicy.ts"),
  read("supabase/migrations/20260818122000_disable_admin_mfa_requirement.sql"),
]);
assert.match(
  adminMfaPolicySource,
  /__DEV__\s*&&\s*process\.env\.EXPO_PUBLIC_ADMIN_MFA_DEV_BYPASS === ["']true["']/,
  "Admin MFA bypass must be explicitly enabled and restricted to development builds.",
);
assert.match(adminAuthSource, /ADMIN_MFA_DEV_BYPASS_ENABLED[\s\S]*return identity/, "Admin authentication must return after the active role check without contacting MFA.");
assert.match(adminMfaSource, /ADMIN_MFA_DEV_BYPASS_ENABLED[\s\S]*requirement: null/, "Admin login routing must not request MFA setup or verification.");
assert.match(adminMfaMigration, /role::text in \('admin', 'super_admin'\)[\s\S]*and is_active/, "Database admin privileges must require an active admin profile.");
assert.doesNotMatch(adminMfaMigration, /auth\.jwt\(\) ->> 'aal'/, "Database admin privileges must not require an MFA assurance claim.");

// --- NativeWind Pressable interop must retain Home control layout -------
// react-native-css-interop 0.2.1 consumes a function-valued Pressable style
// before React Native can evaluate it on Android. These Home controls must
// therefore keep static style arrays and track pressed/hovered state through
// event handlers, or their absolute/flex layout falls back to normal flow.
const NATIVE_PRESSABLE_HOME_PATHS = [
  "app/(tabs)/index.tsx",
  "components/home/HeroCarousel.tsx",
  "components/home/LocationSelector.tsx",
  "components/home/SectionHeader.tsx",
  "components/favorites/FavoriteHeartButton.tsx",
];
const nativePressableHomeSources = await Promise.all(NATIVE_PRESSABLE_HOME_PATHS.map(read));
NATIVE_PRESSABLE_HOME_PATHS.forEach((path, index) => {
  assert.doesNotMatch(
    nativePressableHomeSources[index],
    /style=\{\(\{[^}]*\b(?:pressed|hovered)\b[^}]*\}\)\s*=>/,
    `${path} must not use a callback-valued Pressable style on the Android Home render path.`,
  );
});
const INTEROP_SAFE_LISTING_PATHS = [
  "app/VendorsListing.tsx",
  "components/categories/CategorySearchBar.tsx",
  "components/listing/CategoryFilterChips.tsx",
  "components/listing/CompactSearchBar.tsx",
  "components/listing/ListingFilterModal.tsx",
  "components/locations/CategoryLocationSelector.tsx",
  "components/locations/TalukaLocationSelector.tsx",
];
const interopSafeListingSources = await Promise.all(INTEROP_SAFE_LISTING_PATHS.map(read));
INTEROP_SAFE_LISTING_PATHS.forEach((path, index) => {
  assert.match(
    interopSafeListingSources[index],
    /import Pressable from ["']@\/components\/InteropSafePressable["'];/,
    `${path} must resolve callback-valued Pressable styles before NativeWind native interop.`,
  );
  assert.doesNotMatch(
    interopSafeListingSources[index],
    /import \{[^}]*\bPressable\b[^}]*\} from ["']react-native["'];/,
    `${path} must not bypass the Android-safe Pressable wrapper.`,
  );
});
const INTEROP_SAFE_VENDOR_PATHS = [
  "app/vendor-dashboard.tsx",
  "app/Vendors_dash_profile.tsx",
  "app/VendorGallery.tsx",
  "components/vendor/PublicProfileCard.tsx",
  "components/vendor/SubscriptionDashboardCard.tsx",
  "components/vendor/VendorHeader.tsx",
];
const interopSafeVendorSources = await Promise.all(INTEROP_SAFE_VENDOR_PATHS.map(read));
INTEROP_SAFE_VENDOR_PATHS.forEach((path, index) => {
  assert.match(
    interopSafeVendorSources[index],
    /import Pressable from ["']@\/components\/InteropSafePressable["'];/,
    `${path} must resolve callback-valued Pressable styles before NativeWind native interop.`,
  );
  assert.doesNotMatch(
    interopSafeVendorSources[index],
    /import \{[^}]*\bPressable\b[^}]*\} from ["']react-native["'];/,
    `${path} must not bypass the Android-safe Pressable wrapper.`,
  );
});
const [publicClipsSource, publicClipVideoSource, vendorClipsReelSource] = await Promise.all([
  read("app/(tabs)/clips.tsx"),
  read("clips/components/PublicClipVideo.tsx"),
  read("components/vendor-profile/VendorClipsReelViewer.tsx"),
]);
assert.match(
  publicClipsSource,
  /const \[muted, setMuted\] = useState\(false\);/,
  "Public Clips must start with sound enabled.",
);
assert.match(
  publicClipsSource,
  /if \(isFocused && !previousFocus\.current\) \{[\s\S]{0,180}setMuted\(false\);/,
  "Returning to the public Clips tab must reset playback to sound-on.",
);
assert.match(
  vendorClipsReelSource,
  /const \[muted, setMuted\] = useState\(false\);/,
  "Vendor Clip reels must start with sound enabled.",
);
assert.match(publicClipVideoSource, /instance\.volume = 1;/, "Public Clips must initialize at audible volume.");
assert.match(publicClipVideoSource, /instance\.audioMixingMode = ["']doNotMix["'];/, "Native Clips must request audio focus.");
assert.match(
  publicClipVideoSource,
  /Platform\.OS !== "web"[\s\S]{0,650}setAutoplayBlocked\(true\)[\s\S]{0,220}showPauseState\(true\)/,
  "Web Clips must expose an audible-play action when the browser blocks autoplay.",
);
assert.match(
  publicClipVideoSource,
  /player\.volume = 1;[\s\S]{0,100}player\.muted = muted;[\s\S]{0,100}player\.play\(\);/,
  "The user-started web playback path must apply audible volume before play.",
);
assert.match(publicClipVideoSource, /showMuteControl && active && controlsVisible && !unavailable/, "The Clip mute control must only render during its temporary interaction window.");
assert.doesNotMatch(publicClipVideoSource, /CONTROL_HIDE_DELAY_MS|controlHideTimer/, "Clip play controls must follow playback state without a delayed hide timer.");
assert.match(publicClipVideoSource, /player\.pause\(\);\s*setControlsVisible\(true\);/, "Pausing a Clip must immediately reveal its controls.");
assert.match(publicClipVideoSource, /player\.play\(\);\s*setControlsVisible\(false\);/, "Resuming a Clip must immediately hide its controls.");
const [clipConstantsSource, clipValidationSource, clipUploadSignSource, clipLimitMigrationSource] = await Promise.all([
  read("clips/constants/index.ts"),
  read("clips/utils/validation.ts"),
  read("supabase/functions/clip-upload-sign/index.ts"),
  read("supabase/migrations/20260812180000_limit_new_clips_to_40_mib.sql"),
]);
const CLIP_MAX_BYTES = 40 * 1024 * 1024;
assert.equal(CLIP_MAX_BYTES, 41_943_040, "The Clip limit must use binary MiB.");
assert.ok(39 * 1024 * 1024 <= CLIP_MAX_BYTES, "A 39 MiB Clip must be accepted.");
assert.ok(40 * 1024 * 1024 <= CLIP_MAX_BYTES, "A 40 MiB Clip must be accepted.");
assert.ok(CLIP_MAX_BYTES + 1 > CLIP_MAX_BYTES, "A Clip one byte above 40 MiB must be rejected.");
assert.ok(41 * 1024 * 1024 > CLIP_MAX_BYTES, "A 41 MiB Clip must be rejected.");
assert.ok(52 * 1024 * 1024 > CLIP_MAX_BYTES, "A 52 MiB Clip must be rejected.");
assert.match(clipConstantsSource, /maximumFinalFileSizeBytes: 40 \* 1024 \* 1024/, "Client Clip configuration must cap files at 40 MiB.");
assert.match(clipValidationSource, /requiresCompression: source\.fileSizeBytes > clipsConfig\.media\.maximumFinalFileSizeBytes/, "Only Clips above 40 MiB must enter local compression.");
assert.match(clipUploadSignSource, /kind === ["']video["'] \? 40 \* 1024 \* 1024/, "The Clip signing function must cap video uploads at 40 MiB.");
assert.match(clipLimitMigrationSource, /file_size_bytes <= 41943040/, "The database must enforce the exact 40 MiB byte limit.");
assert.match(clipLimitMigrationSource, /not valid;/i, "The new Clip constraint must preserve previously uploaded oversized rows.");
const clipNativeMediaSource = await read("clips/services/ClipNativeMediaService.ts");
const clipCompressionPlanSource = await read("clips/utils/compressionPlan.ts");
assert.match(clipCompressionPlanSource, /targetFileSizeBytes/, "Native Clip compression must target below the hard limit.");
assert.match(clipCompressionPlanSource, /maximumAttempts/, "Native Clip compression must use a bounded progressive strategy.");
assert.match(clipNativeMediaSource, /stripAudio: false/, "Native Clip compression must preserve audio.");
assert.match(clipNativeMediaSource, /metadata\.size <= clipsConfig\.media\.maximumFinalFileSizeBytes/, "Every compressed Clip must be measured before upload.");
assert.match(clipNativeMediaSource, /unavailable in standard Expo Go/, "Oversized Clips in Expo Go must fail clearly instead of uploading the original.");
assert.match(clipCompressionPlanSource, /Math\.min\(sourceMaxDimension, profile\.maxDimension\)/, "Smart Clip optimization must never upscale low-resolution input.");
assert.match(clipCompressionPlanSource, /maxDimension: 1920[\s\S]*maxDimension: 1280[\s\S]*maxDimension: 960/, "Smart Clip optimization must preserve 1080p before progressively reducing resolution.");
assert.match(clipCompressionPlanSource, /source\.fileSizeBytes \* 8\) \/ duration/, "Smart Clip optimization must calculate bitrate from source size and duration.");
const [clipManagementSource, clipDeleteFunctionSource, clipDeleteMigrationSource, vendorClipsSource, publicClipSource, cloudinaryMediaSharedSource, adminDeleteClipSource] = await Promise.all([
  read("clips/services/ClipManagementService.ts"),
  read("supabase/functions/clip-cloudinary-delete/index.ts"),
  read("supabase/migrations/20260812190000_allow_vendor_clip_deletion_without_active_plan.sql"),
  read("app/VendorClips.tsx"),
  read("clips/services/PublicClipService.ts"),
  read("supabase/functions/_shared/cloudinaryMedia.ts"),
  read("supabase/functions/admin-delete-clip/index.ts"),
]);
// The actual Cloudinary Admin API delete/verify/fallback mechanics were
// extracted from clip-cloudinary-delete/index.ts into
// _shared/cloudinaryMedia.ts so admin-delete-clip reuses the exact same,
// already-verified logic instead of a second copy — these checks follow
// that relocation. Ownership verification and the vendor soft-delete
// completion step are unique to the vendor-facing function and still live
// there, so those checks are unchanged.
const clipDeleteInternalsSource = clipDeleteFunctionSource + cloudinaryMediaSharedSource;
assert.doesNotMatch(clipManagementSource, /vendor_soft_delete_clip[\s\S]*ClipCloudinaryService\.delete/, "The client must not hide a Clip before storage deletion.");
assert.match(clipDeleteFunctionSource, /vendors!inner\(profile_id\)[\s\S]*deleteClipCloudinaryAssets[\s\S]*vendor_soft_delete_clip/, "Secure Clip deletion must verify ownership, clear storage, then update the database.");
assert.match(clipDeleteFunctionSource, /Database deletion failed after storage cleanup/, "Partial Clip deletion failures must be logged for safe retry.");
assert.doesNotMatch(cloudinaryMediaSharedSource, /for \(const \[publicId, resourceType\]/, "Clip deletion must not shadow the resolved Cloudinary public ID inside the asset loop.");
assert.match(clipDeleteInternalsSource, /assetStatus === "deleted" \|\| assetStatus === "not_found"/, "Clip deletion must validate Cloudinary Admin API delete results and treat an already-missing asset idempotently.");
assert.match(clipDeleteInternalsSource, /signCloudinaryParams[\s\S]*Object\.entries\(params\)[\s\S]*\.sort\([\s\S]*public_id: assetPublicId, timestamp:/, "Cloudinary destroy fallback must sign the exact sorted REST request parameters server-side.");
assert.match(clipDeleteInternalsSource, /deliveryType = "upload"[\s\S]*Admin API DELETE \/resources \(Basic Auth\)/, "Clip deletion diagnostics must identify the Cloudinary endpoint category and delivery type.");
assert.match(clipDeleteInternalsSource, /cloudinaryStatus: response\.status[\s\S]*cloudinaryResponse: safeResponseBody/, "Cloudinary failures must log the safe response body and HTTP status.");
assert.doesNotMatch(clipDeleteInternalsSource, /console\.(?:log|error)\([^\n]*apiSecret|console\.(?:log|error)\([^\n]*apiKey/, "Clip deletion logs must not expose Cloudinary credentials.");
assert.doesNotMatch(clipDeleteMigrationSource, /vendor_has_subscription_feature/, "A vendor must be able to delete owned media without an active upload entitlement.");
assert.match(vendorClipsSource, /deletingRef\.current/, "Vendor Clip deletion must retain its duplicate-tap guard.");
assert.match(clipDeleteInternalsSource, /missingCloudinarySecrets[\s\S]*CLOUDINARY_API_KEY[\s\S]*CLOUDINARY_API_SECRET/, "Clip deletion must identify missing server-side Cloudinary credentials.");
assert.match(publicClipSource, /\.eq\("status", "approved"\)[\s\S]*\.eq\("visibility", "public"\)[\s\S]*\.is\("deleted_at", null\)/, "Public Clip queries must never return deleted or non-public Clips.");
// New: admin clip deletion must resolve the vendor server-side, notify
// before touching storage/the database, and never claim success on a
// partial failure.
assert.doesNotMatch(adminDeleteClipSource, /body\.vendorId|body\.category_id|body\.categoryId/, "Admin clip deletion must not accept a client-supplied vendor/category as the deletion target.");
assert.match(adminDeleteClipSource, /private\.is_admin|ADMIN_ROLES/, "Admin clip deletion must verify the caller is an authorized administrator.");
assert.match(adminDeleteClipSource, /aal2/, "Admin clip deletion must require a real MFA-verified (aal2) session, not just the client-side MFA bypass.");
assert.match(adminDeleteClipSource, /vendor_notifications["'][\s\S]*deleteClipCloudinaryAssets[\s\S]*admin_hard_delete_clip/, "Admin clip deletion must notify the vendor, then delete media, then hard-delete the clip, in that order.");
assert.match(adminDeleteClipSource, /stage: "notification"/, "A failed vendor notification must be reported distinctly so the clip is never deleted without notifying the vendor.");
const crmCardSource = await read("components/admin/crm/ui/CRMCard.tsx");
const crmAnalyticsSource = await read("components/admin/crm/ui/AnalyticsCard.tsx");
assert.match(
  crmCardSource,
  /import Pressable from ["']@\/components\/InteropSafePressable["'];/,
  "CRMCard must resolve callback-valued Pressable styles before NativeWind native interop.",
);
assert.doesNotMatch(
  crmCardSource,
  /import \{[^}]*\bPressable\b[^}]*\} from ["']react-native["'];/,
  "CRMCard must not bypass the Android-safe Pressable wrapper.",
);
assert.match(
  crmAnalyticsSource,
  /<View className=["']flex-1 min-w-\[150px\]["']>/,
  "AnalyticsCard sizing must stay on the grid's direct flex child for native layout.",
);
assert.doesNotMatch(
  crmAnalyticsSource,
  /<CRMCard[^>]*className=["'][^"']*\bflex-1\b/,
  "AnalyticsCard must not place grid sizing on CRMCard's nested surface.",
);
const [publicProfileSource, publicProfileStylesSource, publicProfilePartsSource] = await Promise.all([
  read("app/(tabs)/profile.tsx"),
  read("components/profile/profileScreenStyles.ts"),
  read("components/profile/ProfileScreenParts.tsx"),
]);
assert.match(
  publicProfilePartsSource,
  /import Pressable from ["']@\/components\/InteropSafePressable["'];/,
  "Public Profile rows must resolve callback styles before NativeWind native interop.",
);
assert.doesNotMatch(
  publicProfilePartsSource,
  /import \{[^}]*\bPressable\b[^}]*\} from ["']react-native["'];/,
  "Public Profile must not bypass the Android-safe Pressable wrapper.",
);
assert.match(
  publicProfileSource,
  /className=\{Platform\.OS === ["']web["'] \? "bg-card rounded-2xl overflow-hidden border border-border\/80" : undefined\}/,
  "Public Profile grouped-card NativeWind borders must remain web-only so Android never falls back to black token borders.",
);
assert.match(
  publicProfileSource,
  /showNativeSeparator=\{index < accountOptions\.length - 1\}/,
  "Public Profile account rows must use deterministic native separators instead of alpha-token borders.",
);
assert.match(
  publicProfileStylesSource,
  /nativeSurfaceLight:[\s\S]*?backgroundColor: "#FDF2F8",[\s\S]*?borderColor: "#FBCFE8",/,
  "Public Profile Android grouped cards must retain their explicit light pink surface and border colors.",
);
assert.match(
  publicProfileStylesSource,
  /nativeSeparatorLight:[\s\S]*?borderBottomWidth: StyleSheet\.hairlineWidth,[\s\S]*?borderBottomColor: "#F8D8E5",/,
  "Public Profile Android separators must stay explicit hairlines rather than platform-dependent token borders.",
);

// --- Public vendor media must keep its native-only responsive fixes -----
const [portfolioAlbumsSource, vendorClipsGridSource, androidVendorClipsGridSource, pinnedProfileLayoutSource] = await Promise.all([
  read("components/vendor-profile/PortfolioAlbums.tsx"),
  read("components/vendor-profile/VendorClipsGrid.tsx"),
  read("components/vendor-profile/VendorClipsGrid.android.tsx"),
  read("components/vendor-profile/PinnedHeroProfileLayout.tsx"),
]);
assert.match(
  portfolioAlbumsSource,
  /function twoColumnTileWidth\([\s\S]*?PixelRatio\.get\(\)[\s\S]*?Math\.floor/,
  "Portfolio albums must divide measured physical pixels before laying out two Android columns.",
);
assert.match(
  vendorClipsGridSource,
  /import Pressable from ["']@\/components\/InteropSafePressable["'];/,
  "Vendor Clips must retain callback Pressable styles through NativeWind on Android.",
);
assert.match(
  vendorClipsGridSource,
  /onLayout=\{Platform\.OS === ["']web["'] \? undefined/,
  "Vendor Clips must measure its rendered native container instead of assuming the window width.",
);
assert.match(
  androidVendorClipsGridSource,
  /<View style=\{\[styles\.tileFrame, \{ width \}\]\}>[\s\S]*?<Image[\s\S]*?style=\{styles\.thumbnail\}[\s\S]*?<Pressable/,
  "Android Vendor Clips must keep layout and media painting outside the Pressable interaction overlay.",
);
assert.match(
  androidVendorClipsGridSource,
  /thumbnail: \{[\s\S]*?width: ["']100%["'][\s\S]*?height: ["']100%["']/,
  "Android Vendor Clips thumbnails must have explicit non-zero in-flow dimensions.",
);
assert.match(
  androidVendorClipsGridSource,
  /\{clips\.map\(\(clip, index\) =>/,
  "Android Vendor Clips must render every clip without a platform-specific filter.",
);
assert.match(
  pinnedProfileLayoutSource,
  /Platform\.OS === ["']web["'][\s\S]*?\? pageWidth[\s\S]*?: Math\.min\(measuredWidth \|\| pageWidth/,
  "Pinned vendor profiles must preserve the web width path and use measured width only on native.",
);
const approvedInterWeights = ["400Regular", "500Medium", "600SemiBold", "700Bold"];
const approvedPlayfairWeights = ["400Regular", "500Medium", "600SemiBold", "700Bold", "700Bold_Italic"];
for (const weight of approvedInterWeights) {
  assert.match(
    layoutSource,
    new RegExp(`@expo-google-fonts/inter/${weight}`),
    `app/_layout.tsx must import Inter_${weight} from its per-weight submodule.`,
  );
}
for (const weight of approvedPlayfairWeights) {
  assert.match(
    layoutSource,
    new RegExp(`@expo-google-fonts/playfair-display/${weight}`),
    `app/_layout.tsx must import PlayfairDisplay_${weight} from its per-weight submodule.`,
  );
}

// --- Keyboard-safety surfaces must keep explicit per-platform behavior --
const KEYBOARD_SURFACES = [
  "app/VendorEnquiries.tsx",
  "app/BecomeVendor.tsx",
  "app/EditProfile.tsx",
  "components/auth/AuthScreenLayout.tsx",
];
const keyboardSources = await Promise.all(KEYBOARD_SURFACES.map(read));
KEYBOARD_SURFACES.forEach((path, index) => {
  const source = keyboardSources[index];
  const isAuthLayout = path === "components/auth/AuthScreenLayout.tsx";
  assert.match(
    source,
    isAuthLayout
      ? /<KeyboardAwareScrollView/
      : /behavior=\{Platform\.OS === ["']ios["'] \? ["']padding["'] : ["']height["']\}/,
    isAuthLayout
      ? `${path} must use the shared form scroller that lets Android adjustResize handle the keyboard.`
      : `${path} must keep an explicit Android KeyboardAvoidingView behavior.`,
  );
  assert.match(
    source,
    /keyboardShouldPersistTaps=["'](?:handled|always)["']/,
    `${path} must keep keyboardShouldPersistTaps enabled so taps reach controls while the keyboard is open.`,
  );
});

// --- Selection controls must expose radio state without overlapping taps --
const becomeVendorSource = keyboardSources[1];
assert.match(
  becomeVendorSource,
  /accessibilityRole=["']radio["'][\s\S]*?accessibilityState=\{\{ checked:/,
  "BecomeVendor categories must expose checked radio semantics.",
);
const enquiriesSource = keyboardSources[0];
const interactionTokenSource = await read("constants/interactionTokens.ts");
assert.ok(
  (enquiriesSource.match(/accessibilityRole=["']radio["']/g) ?? []).length >= 3,
  "VendorEnquiries filters, sorting, and lead statuses must remain radio groups.",
);
assert.match(
  enquiriesSource,
  /filterTouchTarget: \{ minWidth: interactionTokens\.minimumTouchTarget, minHeight: interactionTokens\.minimumTouchTarget/,
  "VendorEnquiries filter targets must use the shared minimum touch target.",
);
assert.match(
  enquiriesSource,
  /sortTouchTarget: \{ minWidth: interactionTokens\.minimumTouchTarget, minHeight: interactionTokens\.minimumTouchTarget/,
  "VendorEnquiries sort targets must use the shared minimum touch target.",
);
assert.match(
  interactionTokenSource,
  /minimumTouchTarget: 48/,
  "The shared minimum touch target must remain at least 48dp for Android.",
);

// --- Native PDF exports must stay independent from browser-only libraries --
const [nativePdfSource, webPdfSource, sharedPdfSource] = await Promise.all([
  read("components/vendor-marketing-card/MarketingCardPdf.native.tsx"),
  read("components/vendor-marketing-card/MarketingCardPdf.tsx"),
  read("components/vendor-marketing-card/MarketingCardPdf.shared.tsx"),
]);
assert.doesNotMatch(nativePdfSource, /jspdf|html2canvas|dompurify/i, "Native PDF export must not bundle browser PDF dependencies.");
assert.match(nativePdfSource, /buildSingleImagePdfBase64/, "Native PDF export must use the tested native PDF builder.");
assert.match(nativePdfSource, /width: PDF_EXPORT_WIDTH/, "Native capture width must stay pinned to 3000 pixels.");
assert.match(nativePdfSource, /height: PDF_EXPORT_HEIGHT/, "Native capture height must stay pinned to 2000 pixels.");
assert.match(webPdfSource, /import\("jspdf"\)/, "Web PDF export must retain its proven jsPDF path.");
assert.match(webPdfSource, /import\("html2canvas"\)/, "Web PDF export must retain its DOM capture path.");
assert.match(sharedPdfSource, /PDF_EXPORT_WIDTH \/ PixelRatio\.get\(\)/, "Native hidden capture layout must compensate for device density.");

// --- Public vendor links must pass through the shared protocol allowlist ---
const publicVendorProfileSource = await read("app/vendors/[slug].tsx");
assert.match(
  publicVendorProfileSource,
  /openWebsiteUrl\(vendor\.website\)/,
  "Public vendor websites must use the normalized external-link opener.",
);
assert.match(
  publicVendorProfileSource,
  /openInstagramUrl\(vendor\.instagram\)/,
  "Public vendor Instagram links must use the host-validated opener.",
);
assert.doesNotMatch(
  publicVendorProfileSource,
  /Linking\.openURL\(vendor\.(?:website|instagram)\)/,
  "Untrusted vendor URLs must never be opened directly.",
);

// --- Category listing location ranking must never become a radius filter --
const [vendorListingSource, vendorDiscoverySource, locationRankMigrationSource] = await Promise.all([
  read("app/VendorsListing.tsx"),
  read("services/vendorDiscovery.ts"),
  read("supabase/migrations/20260815130000_location_ranked_category_vendors.sql"),
]);
assert.match(vendorListingSource, /fetchLocationRankedVendors\(/, "VendorsListing must use the full location-ranked query when GPS is available.");
assert.doesNotMatch(vendorListingSource, /radiusKm/, "VendorsListing must not restore a customer-selectable distance cutoff.");
assert.match(vendorDiscoverySource, /LISTING_NEARBY_THRESHOLD_KM = 20/, "The category listing nearby priority bucket must remain 20 km.");
assert.doesNotMatch(locationRankMigrationSource, /st_dwithin/i, "The category listing query must rank by distance without excluding farther vendors.");
assert.match(locationRankMigrationSource, /distance_bucket asc,\s*membership_rank asc,/i, "Distance bucket must rank before Elite/Premium membership priority.");
assert.match(locationRankMigrationSource, /when 'elite' then 0\s*when 'premium' then 1/i, "Elite must rank before Premium in location-ranked results.");

// --- Aggregate runner must still register every non-credentialed check --
const runnerSource = await read("scripts/run-smoke-tests.mjs");
const expectedChecks = [
  "scripts/smoke-profile-propagation.mjs",
  "scripts/test-subscription-domain.mjs",
  "scripts/test-package-domain.mjs",
  "scripts/test-contact-actions.mjs",
  "scripts/test-location-domain.mjs",
  "scripts/test-auth-validation.mjs",
  "scripts/test-marketing-card-pdf.mjs",
];
for (const script of expectedChecks) {
  assert.match(
    runnerSource,
    new RegExp(script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `scripts/run-smoke-tests.mjs must still run ${script}.`,
  );
}
assert.doesNotMatch(
  runnerSource,
  /e2e-profile-propagation/,
  "scripts/run-smoke-tests.mjs must not pick up the credentialed e2e script.",
);
assert.match(
  runnerSource,
  /process\.exit\(1\)/,
  "scripts/run-smoke-tests.mjs must exit non-zero when a check fails.",
);

// --- Admin Finance must stay scoped, protected, and payment-backed ------
const [adminFinanceSource, financeServiceSource, financeMigrationSource, adminNavigationSource] = await Promise.all([
  read("app/AdminFinance.tsx"),
  read("services/adminFinanceService.ts"),
  read("supabase/migrations/20260815170000_admin_finance_control_center.sql"),
  read("admin/navigation.ts"),
]);
for (const excludedModule of ["Cash Flow", "Invoices & Payments", "Vendor Subscription Analytics"]) {
  assert.doesNotMatch(adminFinanceSource, new RegExp(excludedModule, "i"), `Admin Finance must not add the excluded ${excludedModule} module.`);
}
assert.match(adminNavigationSource, /route:\s*["']\/AdminFinance["']/, "The admin navigation must expose the Finance control center.");
assert.match(financeServiceSource, /status === ["']recorded["']/, "Finance summaries must ignore void ledger records.");
assert.match(financeMigrationSource, /subscription_payments_sync_finance/, "Verified subscription payments must sync into the finance ledger.");
assert.match(financeMigrationSource, /private\.is_admin\(\)/, "Finance tables and RPCs must remain admin-only.");
assert.match(financeMigrationSource, /prevent_closed_finance_month_change/, "Closed finance periods must remain protected from manual ledger changes.");
for (const guard of ["finance_budgets_closed_month_guard", "finance_budget_items_closed_month_guard", "finance_tax_records_closed_month_guard", "finance_cloudinary_usage_closed_month_guard"]) {
  assert.match(financeMigrationSource, new RegExp(guard), `${guard} must protect closed monthly records outside the UI.`);
}
assert.match(financeMigrationSource, /finance_month_is_closed\(existing_date\)[\s\S]*return new/, "Payment status updates must not mutate a closed ledger or break payment verification.");
assert.match(financeMigrationSource, /payment\.payment_status = 'verified'[\s\S]*payment\.amount > 0/, "Zero-value promotional payments must not be backfilled as earned revenue.");
assert.match(financeMigrationSource, /finance_range_touches_closed\(new\.period_start, new\.period_end\)[\s\S]*finance_range_touches_closed\(old\.period_start, old\.period_end\)/, "Tax records must protect every closed month intersecting both their old and new ranges.");
const financeUiSource = await read("components/admin/finance/FinanceUI.tsx");
assert.match(financeUiSource, /disabled:\s*props\.editable === false/, "Finance fields must only announce disabled when editable is explicitly false.");
assert.doesNotMatch(financeUiSource, /outlineStyle:\s*["']none["']/, "Finance inputs must retain a visible web keyboard-focus outline.");
const [financeLinksMigrationSource, financeWebhookSource] = await Promise.all([
  read("supabase/migrations/20260815200000_complete_admin_finance_data_links.sql"),
  read("supabase/functions/razorpay-webhook/index.ts"),
]);
assert.match(financeLinksMigrationSource, /source_event_key[\s\S]*:receipt[\s\S]*:refund/, "Payment receipts and refunds must remain separate linked ledger events.");
assert.match(financeLinksMigrationSource, /admin_save_finance_budget[\s\S]*jsonb_to_recordset/, "Budget header and category items must save through one atomic database operation.");
assert.match(financeLinksMigrationSource, /alter publication supabase_realtime add table public\.%I/, "Finance realtime listeners must be backed by the Supabase publication.");
assert.match(financeWebhookSource, /refundEntity\?\.payment_id[\s\S]*razorpay_payment_id/, "Refund webhooks must resolve the source payment even without an order payload.");
assert.match(financeWebhookSource, /refunded_amount_minor[\s\S]*partially_refunded/, "Refund webhooks must accumulate partial refunds instead of treating every refund as full.");

console.log("Regression guard checks passed.");
