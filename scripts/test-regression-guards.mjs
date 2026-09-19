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
const enquiryServiceSource = await read("services/enquiries.ts");
const enquiryPushFunctionSource = await read("supabase/functions/send-enquiry-push/index.ts");
const enquiryPushMigrationSource = await read("supabase/migrations/20260905170000_enquiry_push_delivery.sql");
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
assert.match(pushServiceSource, /setNotificationChannelAsync\("enquiries"[\s\S]{0,300}AndroidImportance\.MAX/, "Android must create the high-importance enquiry channel before requesting an Expo token.");
assert.match(pushRegistrarSource, /targetPath[\s\S]{0,500}addNotificationResponseReceivedListener/, "Tapping a push notification must navigate to its internal target.");
assert.match(enquiryServiceSource, /create_tracked_enquiry[\s\S]{0,900}send-enquiry-push/, "A saved tracked enquiry must request best-effort vendor push delivery.");
assert.match(enquiryPushFunctionSource, /action_token !== actionToken/, "Enquiry push delivery must verify the unguessable create action token.");
assert.match(enquiryPushFunctionSource, /enquiry_push_deliveries[\s\S]{0,1400}duplicate/, "Enquiry push delivery must be idempotent.");
assert.match(enquiryPushFunctionSource, /channelId: "enquiries"[\s\S]{0,200}targetPath: "\/VendorEnquiries"/, "Enquiry pushes must use the dedicated channel and deep-link to the Vendor enquiry inbox.");
assert.match(enquiryPushMigrationSource, /revoke all on public\.enquiry_push_deliveries from public, anon, authenticated/, "Push-delivery idempotency records must remain server-only.");
assert.doesNotMatch(
  layoutSource,
  /from ['"]@expo-google-fonts\/playfair-display['"]/, // Guard the package barrel import.
  "app/_layout.tsx must not reintroduce the Playfair barrel import (bundles all 12 weights).",
);

// --- Android system splash hands off to the 1.5s branded mobile splash --
assert.match(layoutSource, /startupSplashVisible/, "Native startup must show the branded splash after Android's mandatory system launch surface.");
assert.match(layoutSource, /<StartupSplash[\s\S]*onReady=\{revealStartupSplash\}[\s\S]*onFinish=\{finishStartupSplash\}/, "The branded splash must own the native-to-app handoff.");
assert.match(layoutSource, /<PageLoaderProvider suppressed=\{startupSplashVisible\}>/, "The page loader must remain suppressed while the branded splash is visible.");
assert.match(layoutSource, /webBootLoading \? <PageLoader \/>/, "Web startup and refresh must use the shared page loader instead of the branded splash.");
const startupSplashSource = await read("components/loading/StartupSplash.tsx");
assert.match(startupSplashSource, /assets\/images\/splash_mobile\.png/, "The native branded splash must use splash_mobile.png in portrait orientation.");
assert.match(startupSplashSource, /SPLASH_VISIBLE_MS = 1_500/, "The branded splash must remain visible for exactly 1.5 seconds after its image loads.");
const androidSplashStyleSource = await read("android/app/src/main/res/values/styles.xml");
assert.match(androidSplashStyleSource, /windowSplashScreenAnimatedIcon">@drawable\/splashscreen_logo_inset</, "Android's mandatory system launch surface must show the safely inset canonical app icon.");
const androidSplashInsetSource = await read("android/app/src/main/res/drawable/splashscreen_logo_inset.xml");
assert.match(androidSplashInsetSource, /android:drawable="@mipmap\/ic_launcher_foreground"/, "The Android splash inset must use the canonical app icon artwork.");
assert.match(androidSplashInsetSource, /android:inset="22%"/, "The Android splash icon must retain enough safe padding to avoid system-mask cropping.");

// --- Vendor portfolio management actions must stay discoverable --------
const vendorGallerySource = await read("app/VendorGallery.tsx");
const vendorGalleryStylesSource = await read("components/vendor/gallery/vendorGalleryStyles.ts");
const reviewFormSource = await read("components/reviews/ReviewForm.tsx");
const connectedVendorReviewsSource = await read("components/reviews/ConnectedVendorReviews.tsx");
const vendorReviewsSectionSource = await read("components/reviews/VendorReviewsSection.tsx");
assert.doesNotMatch(reviewFormSource, /ReviewPhotoUploader|Add photo|Photos \(optional\)/, "The public Vendor Profile review form must not offer photo uploads.");
assert.doesNotMatch(connectedVendorReviewsSource, /pickReviewPhotos|uploadReviewPhoto|onAddPhotos|onRemovePhoto/, "The connected review form must not retain unreachable photo-upload actions.");
assert.match(connectedVendorReviewsSource, /imageUrls: reviewPhotos/, "Editing an existing review must preserve its previously saved photos.");
assert.match(vendorReviewsSectionSource, /<Modal[\s\S]{0,300}visible=\{Boolean\(props\.showForm && props\.onSubmitReview\)\}/, "Writing or editing a review must open in a focused modal.");
assert.match(vendorReviewsSectionSource, /KeyboardAvoidingView[\s\S]{0,500}keyboardShouldPersistTaps="handled"/, "The review modal must remain usable while the keyboard is open.");
assert.match(vendorGallerySource, /data\.media\.filter\(\(item\) => item\.resource_type === "image"\)\.length/, "Portfolio summary must derive current photo usage from refreshed portfolio media rows.");
assert.match(vendorGallerySource, /access\?\.photo_limit/, "Portfolio summary must show the authoritative current-plan photo limit.");
assert.match(vendorGallerySource, /setSelectedAlbumId\(album\.id\);[\s\S]{0,100}setAlbumPreview\(album\)/, "Tapping a Your Albums card must open that album.");
assert.match(vendorGallerySource, /accessibilityLabel=\{`Delete \$\{item\.resource_type\}`\}[\s\S]{0,180}removeMedia\(item\)/, "Every uploaded media tile must expose its delete action.");
assert.match(vendorGallerySource, /accessibilityLabel=\{`Delete \$\{item\.resource_type\} from \$\{albumPreview\?\.title \|\| "album"\}`\}[\s\S]{0,180}removeMedia\(item, albumPreview\)/, "Every image in the open album preview must expose a direct delete action.");
assert.match(vendorGallerySource, /const removeMedia[\s\S]{0,180}requireFeature\("upload_gallery"\)/, "Portfolio media deletion must use the same subscription feature enforced by the delete backend.");
assert.match(vendorGallerySource, /Platform\.OS === "web" && returnToAlbum[\s\S]{0,400}setTimeout\(showDeleteConfirmation, 0\)/, "Web album deletion must present its confirmation above the album preview modal.");
assert.match(vendorGallerySource, /style=\{styles\.previewFooter\}/, "The full-screen media preview must keep its controls in a visible footer.");
assert.match(vendorGallerySource, /accessibilityLabel="Delete media"[\s\S]{0,180}setPreviewDeleteCandidate\(preview\)/, "The preview delete action must open its confirmation in place.");
assert.match(vendorGallerySource, /previewDeleteCandidate && <View style=\{styles\.previewConfirmBackdrop\}>[\s\S]{0,1200}deleteMediaNow\(previewDeleteCandidate\)/, "Media preview deletion must be confirmed inside the active preview modal.");
assert.doesNotMatch(vendorGalleryStylesSource, /previewActions:\s*\{[^}]*position:\s*["']absolute["']/, "Preview actions must remain in normal layout flow instead of overlapping the image.");
assert.match(vendorGallerySource, /uploadsCompleted[\s\S]{0,500}finishUpload[\s\S]{0,500}>Done</, "A completed upload must replace the Upload action with Done.");
const portfolioDeleteFunctionSource = await read("supabase/functions/portfolio-media-delete/index.ts");
const portfolioDeleteGrantSource = await read("supabase/migrations/20260905123000_grant_service_role_portfolio_delete.sql");
assert.match(portfolioDeleteFunctionSource, /SUPABASE_SERVICE_ROLE_KEY/, "Portfolio deletion must use the trusted server client after user ownership is verified.");
assert.match(vendorGallerySource, /deletePortfolioMedia\(item\.id, \{[\s\S]{0,180}vendorId: data\.vendor\.id,[\s\S]{0,180}publicId: item\.public_id/, "Portfolio deletion must provide the owned Bunny identity when a media ID is stale.");
assert.match(portfolioDeleteFunctionSource, /if \(!media && vendorId && publicId\)[\s\S]{0,350}\.eq\("vendor_id", vendorId\)\.eq\("public_id", publicId\)/, "Portfolio deletion must safely resolve stale media IDs by vendor and public ID.");
assert.match(portfolioDeleteFunctionSource, /admin\.from\("vendor_portfolio_media"\)\.delete\(\)/, "Portfolio deletion must remove the database record after Bunny cleanup succeeds.");
assert.match(portfolioDeleteGrantSource, /grant select, delete on public\.vendor_portfolio_media to service_role/, "The portfolio delete service role must be able to resolve and remove the owned media row.");

// --- Native auth screens must remain usable above the Android keyboard ---
const [authLayoutSource, otpFieldSource, keyboardAwareScrollSource] = await Promise.all([
  read("components/auth/AuthScreenLayout.tsx"),
  read("components/auth/OtpCodeField.tsx"),
  read("components/keyboard/KeyboardAwareScrollView.tsx"),
]);
assert.match(authLayoutSource, /<KeyboardAwareScrollView/, "Auth screens must use the shared keyboard-aware form scroller.");
assert.match(keyboardAwareScrollSource, /behavior=\{Platform\.OS === "ios" \? "padding" : avoidKeyboardOnAndroid \? "height" : undefined\}/, "Android forms must rely on adjustResize unless a surface explicitly opts into keyboard avoidance.");
assert.doesNotMatch(keyboardAwareScrollSource, /keyboardTailHeight|setKeyboardTailHeight/, "Keyboard-aware forms must not add a second keyboard-height spacer on top of window resizing.");
assert.match(keyboardAwareScrollSource, /keyboardDismissMode = "none"/, "Manual auth-form scrolling must never dismiss the keyboard.");
assert.doesNotMatch(keyboardAwareScrollSource, /FOCUS_POLL_MS|setInterval\(/, "Focused auth inputs must reveal directly instead of relying on a polling loop.");
assert.match(keyboardAwareScrollSource, /KeyboardAwareFormContext\.Provider/, "The shared form scroller must expose one direct focus-to-scroll coordinator.");
const [vendorEditLocationSource, vendorEditAboutSource, vendorEditContactSource, vendorFormKitSource] = await Promise.all([
  read("app/VendorEditLocation.tsx"),
  read("app/VendorEditAbout.tsx"),
  read("app/VendorEditContact.tsx"),
  read("components/vendor/VendorProfileFormKit.tsx"),
]);
assert.match(
  vendorEditLocationSource,
  /<KeyboardAwareScrollView\s+avoidKeyboardOnAndroid\s+contentContainerStyle=\{kitStyles\.content\}/,
  "Vendor location editing must keep the Business address field above the Android keyboard.",
);
assert.match(vendorEditAboutSource, /<KeyboardAwareScrollView avoidKeyboardOnAndroid/, "Vendor About editing must remain visible above the Android keyboard.");
assert.match(vendorEditContactSource, /<KeyboardAwareScrollView avoidKeyboardOnAndroid/, "Vendor Contact editing must remain visible above the Android keyboard.");
assert.match(vendorEditAboutSource, /multiline\s+advanceOnSubmit/, "The About description keyboard action must advance to Years of experience.");
assert.match(vendorFormKitSource, /submitBehavior=\{shouldAdvanceOnSubmit \? "submit" : "newline"\}/, "Vendor fields must submit deterministically before focusing the next input.");
assert.match(vendorEditContactSource, /contactField: \{ width: "100%" \}/, "Vendor Contact inputs must use the full mobile card width.");
assert.match(vendorEditContactSource, /useTwoColumns && styles\.contactFieldWide/, "Vendor Contact inputs may use two columns only on wider screens.");
assert.match(keyboardAwareScrollSource, /TextInput\.State\.currentlyFocusedInput\(\)/, "The shared form scroller must discover focus centrally without per-field handlers.");
assert.match(keyboardAwareScrollSource, /scrollResponderScrollNativeHandleToKeyboard/, "The shared form scroller must use React Native's native keyboard-aware focus reveal path.");
assert.match(keyboardAwareScrollSource, /keyboardDidShow/, "The shared form scroller must re-check focus after Android finishes resizing for the keyboard.");
assert.match(authLayoutSource, /keyboardShouldPersistTaps="always"/, "Auth controls must remain tappable while the keyboard is open.");
assert.match(authLayoutSource, /keyboardDismissMode="none"/, "The auth shell must not opt into iOS interactive or Android drag keyboard dismissal.");
const [authFieldSource, passwordFieldSource, createPasswordFormSource, loginSource, vendorAuthSource] = await Promise.all([
  read("components/auth/AuthField.tsx"),
  read("components/auth/PasswordField.tsx"),
  read("components/auth/CreatePasswordForm.tsx"),
  read("app/Login.tsx"),
  read("app/VendorAuth.tsx"),
]);
assert.match(authFieldSource, /keyboardForm\?\.revealInput\(inputRef\.current\)/, "Every shared auth input must notify the form scroller when focused.");
assert.match(passwordFieldSource, /requestAnimationFrame\(\(\) => inputRef\.current\?\.focus\(\)\)/, "Toggling password visibility must retain native input focus and its keyboard.");
assert.match(createPasswordFormSource, /onSubmitEditing=\{\(\) => confirmPasswordRef\.current\?\.focus\(\)\}/, "Password Next must advance to Confirm Password.");
assert.match(loginSource, /const fullNameRef = useRef<TextInput>\(null\)/, "Signup must keep a dedicated Full name native focus reference.");
assert.match(vendorAuthSource, /const ownerNameRef = useRef<TextInput>\(null\)/, "Vendor signup must keep a dedicated Owner name native focus reference.");
assert.match(otpFieldSource, /InteractionManager\.runAfterInteractions/, "OTP focus must wait until navigation has completed so Android opens the keypad.");
assert.match(otpFieldSource, /showSoftInputOnFocus/, "OTP input must explicitly request the software keypad.");
assert.match(otpFieldSource, /inset: 0, opacity: 0\.01/, "OTP input must keep a touch-sized native focus target.");
assert.match(otpFieldSource, /keyboardForm\?\.revealInput\(inputRef\.current\)/, "OTP focus must use the same direct keyboard-aware reveal path as text fields.");

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
assert.match(homeScreenSource, /requestDeviceLocationServices\(\)/, "Homepage location action must invoke Android's system location-resolution dialog when services are off.");
assert.match(homeScreenSource, /onPress=\{\(\) => void refreshHomeLocation\(true\)\}/, "Homepage location icon must fetch in place rather than navigate away.");
assert.doesNotMatch(homeScreenSource, /router\.push\("\/NearbyVendors"\)/, "Homepage must not route location actions to the obsolete NearbyVendors screen.");
assert.doesNotMatch(homeScreenSource, /Unable to get location|Turn on device location/, "Homepage startup and resume must not show stale location-error modals.");
const deviceLocationSource = await read("services/deviceLocation.ts");
assert.match(deviceLocationSource, /Location\.enableNetworkProviderAsync\(\)/, "Android location recovery must use the official Google Play services resolution flow.");
assert.match(deviceLocationSource, /LAST_LOCATION_COORDINATES_KEY[\s\S]*RECENT_COORDINATES_MAX_AGE_MS/, "A recently verified Home location must remain reusable without another Android prompt.");

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
const [vendorClipUploadSource, vendorClipEditSource, vendorClipManagementSource, vendorClipOrchestratorSource, vendorClipCategoryMigrationSource, vendorClipCategorySyncMigrationSource] = await Promise.all([
  read("app/VendorClipUpload.tsx"),
  read("app/VendorClipEdit.tsx"),
  read("clips/services/ClipManagementService.ts"),
  read("clips/services/ClipUploadOrchestrator.ts"),
  read("supabase/migrations/20260912163000_enforce_vendor_clip_category.sql"),
  read("supabase/migrations/20260913123000_keep_clip_category_synced_to_vendor.sql"),
]);
assert.match(vendorClipUploadSource, /const categoryId = data\.vendor\?\.category_id \?\? "";/, "Clip uploads must inherit the authenticated vendor's category.");
assert.doesNotMatch(vendorClipUploadSource, /useCategories|categoryOpen|setCategoryId|Choose category/, "Vendors must not manually choose a category while uploading Clips.");
assert.doesNotMatch(vendorClipEditSource, /useCategories|categoryOpen|setCategoryId|ChevronDown|>Category</, "Vendors must not change a Clip's category while editing it.");
assert.doesNotMatch(vendorClipManagementSource, /category_id:\s*input\.categoryId/, "Clip edits must not write a client-selected category.");
assert.match(vendorClipUploadSource, /router\.push\("\/VendorEditBusinessInfo"\)/, "A vendor without a category must have a direct recovery path before uploading Clips.");
assert.match(vendorClipOrchestratorSource, /from\("vendors"\)[\s\S]{0,120}select\("category_id"\)[\s\S]{0,120}eq\("id", draft\.vendorId\)/, "The upload pipeline must resolve the current category from the vendor row.");
assert.match(vendorClipOrchestratorSource, /category_id: authoritativeCategoryId/, "The upload payload must use the server-read vendor category.");
assert.match(vendorClipCategoryMigrationSource, /select vendor\.category_id into vendor_category_id/, "Clip finalization must resolve category from the authoritative vendor record.");
assert.match(vendorClipCategoryMigrationSource, /target_vendor_id,\s+vendor_category_id,/, "Clip finalization must insert the vendor category instead of trusting the client payload.");
assert.match(vendorClipCategorySyncMigrationSource, /before insert or update of vendor_id, category_id on public\.clips/, "Direct Clip writes must keep category synchronized with the vendor.");
assert.match(
  publicClipsSource,
  /const \[muted, setMuted\] = useState\(false\);/,
  "Public Clips must start with sound enabled.",
);
assert.match(publicClipsSource, /const tabBarHeight = useMobileTabBarHeight\(\);/, "Native Clips must measure the real floating tab-bar height.");
assert.match(publicClipsSource, /marginBottom: Platform\.OS === "web" \? 0 : tabBarHeight/, "Native Clips content must end above the overlaid bottom navigation.");
assert.match(
  publicClipsSource,
  /if \(isFocused && !previousFocus\.current\) \{[\s\S]{0,220}beginNewFeedSession\(\);/,
  "Returning to the public Clips tab must begin a fresh feed session.",
);
assert.doesNotMatch(
  publicClipsSource,
  /if \(isFocused && !previousFocus\.current\) \{[\s\S]{0,220}setMuted\(false\);/,
  "Returning to the public Clips tab must retain the viewer's sound choice.",
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
assert.match(publicClipVideoSource, /showMuteControl && active && !unavailable/, "The active Clip must keep its mute control available.");
assert.doesNotMatch(publicClipVideoSource, /CONTROL_HIDE_DELAY_MS|controlHideTimer/, "Clip play controls must follow playback state without a delayed hide timer.");
assert.match(publicClipVideoSource, /singleTapTimer\.current = setTimeout\([\s\S]{0,180}togglePlayback\(\);[\s\S]{0,80}DOUBLE_TAP_MS/, "A single tap must toggle playback only after the double-tap window.");
assert.match(publicClipVideoSource, /clearTimeout\(singleTapTimer\.current\);[\s\S]{0,180}burstHeart\(\);[\s\S]{0,80}onDoubleTapLike\(\);[\s\S]{0,30}return;/, "A double tap must like without also toggling playback.");
assert.doesNotMatch(publicClipVideoSource, /!useBunnyWebPlayer && <Pressable/, "Bunny web Clips must keep the same center-tap playback surface as other video sources.");
assert.match(publicClipVideoSource, /controlBunnyPlayer\("pause"\)/, "Center-tapping a playing Bunny web Clip must pause its embedded player.");
assert.match(publicClipVideoSource, /controlBunnyPlayer\("play"\)/, "Center-tapping a paused Bunny web Clip must resume its embedded player.");
assert.match(publicClipVideoSource, /!useBunnyWebPlayer \? <Animated\.View pointerEvents="none" style=\{\[styles\.playBurst, playStyle\]\}/, "Bunny web Clips must not render a second play icon over the embedded player's own control.");
assert.match(publicClipVideoSource, /contentWindow\?\.postMessage\([\s\S]{0,180}"\*"\)/, "Bunny Player.js commands must remain valid while the iframe transitions away from its initial parent origin.");
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
const [clipManagementSource, clipDeleteFunctionSource, clipDeleteMigrationSource, vendorClipsSource, publicClipSource, bunnyMediaSharedSource, adminDeleteClipSource] = await Promise.all([
  read("clips/services/ClipManagementService.ts"),
  read("supabase/functions/clip-media-delete/index.ts"),
  read("supabase/migrations/20260812190000_allow_vendor_clip_deletion_without_active_plan.sql"),
  read("app/VendorClips.tsx"),
  read("clips/services/PublicClipService.ts"),
  read("supabase/functions/_shared/bunnyClipMedia.ts"),
  read("supabase/functions/admin-delete-clip/index.ts"),
]);
const clipDeleteInternalsSource = clipDeleteFunctionSource + bunnyMediaSharedSource;
assert.doesNotMatch(clipManagementSource, /vendor_soft_delete_clip[\s\S]*ClipBunnyService\.delete/, "The client must not hide a Clip before storage deletion.");
assert.match(clipDeleteFunctionSource, /vendors!inner\(profile_id\)[\s\S]*deleteClipBunnyAssets[\s\S]*vendor_soft_delete_clip/, "Secure Clip deletion must verify ownership, clear storage, then update the database.");
assert.match(clipDeleteFunctionSource, /Database deletion failed after storage cleanup/, "Partial Clip deletion failures must be logged for safe retry.");
assert.match(clipDeleteInternalsSource, /video\.bunnycdn\.com[\s\S]*method: "DELETE"/, "Clip deletion must remove the Bunny Stream video.");
assert.match(clipDeleteInternalsSource, /thumbnail\.[\$\{]extension[\s\S]*method: "DELETE"/, "Clip deletion must remove custom Bunny thumbnails idempotently.");
assert.doesNotMatch(clipDeleteMigrationSource, /vendor_has_subscription_feature/, "A vendor must be able to delete owned media without an active upload entitlement.");
assert.match(vendorClipsSource, /deletingRef\.current/, "Vendor Clip deletion must retain its duplicate-tap guard.");
assert.doesNotMatch(clipDeleteInternalsSource, new RegExp(["cloud", "inary"].join(""), "i"), "Clip deletion must remain Bunny-only.");
assert.match(publicClipSource, /\.eq\("status", "approved"\)[\s\S]*\.eq\("visibility", "public"\)[\s\S]*\.is\("deleted_at", null\)/, "Public Clip queries must never return deleted or non-public Clips.");
// New: admin clip deletion must resolve the vendor server-side, notify
// before touching storage/the database, and never claim success on a
// partial failure.
assert.doesNotMatch(adminDeleteClipSource, /body\.vendorId|body\.category_id|body\.categoryId/, "Admin clip deletion must not accept a client-supplied vendor/category as the deletion target.");
assert.match(adminDeleteClipSource, /private\.is_admin|ADMIN_ROLES/, "Admin clip deletion must verify the caller is an authorized administrator.");
assert.match(adminDeleteClipSource, /aal2/, "Admin clip deletion must require a real MFA-verified (aal2) session, not just the client-side MFA bypass.");
assert.match(adminDeleteClipSource, /vendor_notifications["'][\s\S]*deleteClipBunnyAssets[\s\S]*admin_hard_delete_clip/, "Admin clip deletion must notify the vendor, then delete media, then hard-delete the clip, in that order.");
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

// --- Public vendor profile must not expose vendor location/social actions in About ---
const publicVendorProfileSource = await read("app/vendors/[slug].tsx");
assert.doesNotMatch(
  publicVendorProfileSource,
  /GetDirectionsButton|styles\.directionsRow/,
  "Public vendor About must not render vendor directions.",
);
assert.doesNotMatch(
  publicVendorProfileSource,
  /openWebsiteUrl|openInstagramUrl|styles\.linkChip/,
  "Public vendor profiles must not render Website or Instagram actions.",
);
assert.doesNotMatch(
  publicVendorProfileSource,
  /sameAs:\s*\[vendor\.website, vendor\.instagram/,
  "Public vendor structured metadata must not expose Website or Instagram links.",
);

// --- Category listing location ranking must never become a radius filter --
const [vendorListingSource, vendorDiscoverySource, locationRankMigrationSource] = await Promise.all([
  read("app/VendorsListing.tsx"),
  read("services/vendorDiscovery.ts"),
  read("supabase/migrations/20260815130000_location_ranked_category_vendors.sql"),
]);
assert.match(vendorListingSource, /fetchLocationRankedVendors\(/, "VendorsListing must use the full location-ranked query when GPS is available.");
assert.match(vendorListingSource, /onUseCurrentLocation=\{useCurrentLocation\}/, "The category Taluka sheet must offer current-location vendor discovery.");
assert.match(vendorListingSource, /requestDeviceLocationServices\(\)/, "Category current-location discovery must use Android's system location-resolution flow.");
assert.match(vendorListingSource, /requestDeviceLocationServices\(\)[\s\S]{0,500}if \(deviceOrigin\)[\s\S]{0,420}clearGuestGeoPreference\(\)/, "Category current-location discovery must confirm services are enabled before reusing an already-resolved Home/listing origin.");
assert.doesNotMatch(vendorListingSource, /getLastDetectedCoordinates\(\)|getLastDetectedLocationLabel\(\)|loadGuestGeoPreference\(\)/, "Category listings must not auto-activate a location from cached Home GPS or a stored Taluka preference.");
assert.match(vendorListingSource, /useState<GeoSelection \| null>\(null\)/, "Category listings must begin without an active location filter.");
assert.doesNotMatch(vendorListingSource, /radiusKm/, "VendorsListing must not restore a customer-selectable distance cutoff.");
assert.match(vendorDiscoverySource, /LISTING_NEARBY_THRESHOLD_KM = 20/, "The category listing nearby priority bucket must remain 20 km.");
assert.doesNotMatch(locationRankMigrationSource, /st_dwithin/i, "The category listing query must rank by distance without excluding farther vendors.");
assert.match(locationRankMigrationSource, /distance_bucket asc,\s*membership_rank asc,/i, "Distance bucket must rank before Elite/Premium membership priority.");
assert.match(locationRankMigrationSource, /when 'elite' then 0\s*when 'premium' then 1/i, "Elite must rank before Premium in location-ranked results.");

// --- Public vendor app-download prompt must respect its dismissal cooldown --
const downloadAppPopupSource = await read("components/vendor-profile/DownloadAppPopup.tsx");
assert.match(downloadAppPopupSource, /7 \* 24 \* 60 \* 60 \* 1000/, "The app-download popup dismissal cooldown must remain seven days.");
assert.match(downloadAppPopupSource, /localStorage\?\.getItem\(DISMISSED_AT_KEY\)/, "The app-download popup must read its previous dismissal before scheduling itself.");
assert.match(downloadAppPopupSource, /localStorage\?\.setItem\(DISMISSED_AT_KEY, String\(Date\.now\(\)\)\)/, "Closing the app-download popup must persist the dismissal time.");
assert.match(downloadAppPopupSource, /setTimeout\(\(\) => setVisible\(true\), 1500\)/, "The existing app-download popup timing must remain unchanged.");

// --- OTP-verified customer self-service account deletion --
const [accountDeletionScreenSource, accountDeletionServiceSource, customerDeletionFunctionSource, customerDeletionMigrationSource, customerDeletionFixSource, customerDeletionStorageSource] = await Promise.all([
  read("app/account-deletion.tsx"),
  read("services/accountDeletion.ts"),
  read("supabase/functions/delete-customer-account/index.ts"),
  read("supabase/migrations/20260905190000_customer_self_service_deletion.sql"),
  read("supabase/migrations/20260919103000_fix_customer_deletion_enquiry_anonymization.sql"),
  read("supabase/migrations/20260919120000_list_owned_storage_for_customer_deletion.sql"),
]);
assert.match(accountDeletionScreenSource, /sendCustomerDeletionOtp/, "Customer deletion must require a fresh email OTP.");
assert.match(accountDeletionScreenSource, /Delete my account permanently/, "Customer deletion must retain an explicit irreversible confirmation.");
assert.match(accountDeletionServiceSource, /shouldCreateUser: false/, "Deletion OTP must never create a new auth user.");
assert.match(customerDeletionFunctionSource, /hasRecentEmailOtp\(token\)/, "The deletion backend must verify recent OTP authentication server-side.");
assert.match(customerDeletionFunctionSource, /profile\?\.role !== "public_user"/, "The deletion backend must reject non-customer roles.");
assert.match(customerDeletionFunctionSource, /auth\.admin\.deleteUser\(user\.id, false\)/, "The deletion backend must hard-delete only the authenticated user resolved from the JWT.");
assert.doesNotMatch(customerDeletionFunctionSource, /body\.(?:user|profile|customer)_?id/i, "The deletion backend must never trust a client-supplied account identifier.");
assert.match(customerDeletionMigrationSource, /customer_name = 'Deleted customer'[\s\S]*customer_email = null[\s\S]*customer_phone = null/, "Retained enquiries must be anonymized before customer deletion.");
assert.match(customerDeletionMigrationSource, /role = 'public_user'/, "The deletion transaction must enforce the customer role in PostgreSQL too.");
assert.match(customerDeletionFixSource, /guest_session_id = coalesce\(guest_session_id, gen_random_uuid\(\)\)/, "Customer enquiries must retain an anonymous actor before customer_id is cleared.");
assert.match(customerDeletionStorageSource, /objects\.owner_id = auth\.uid\(\)::text/, "Storage cleanup discovery must be limited to objects owned by the authenticated caller.");
assert.match(customerDeletionFunctionSource, /service\.storage\.from\(bucketId\)\.remove/, "Owned Supabase Storage files must be removed through the Storage API before Auth deletion.");
assert.match(customerDeletionFunctionSource, /media cleanup skipped/, "Remote media cleanup must not block customer account deletion.");
assert.match(customerDeletionFunctionSource, /stage, message:/, "Customer deletion failures must record the failing stage.");
assert.match(accountDeletionServiceSource, /Support reference:/, "Customer deletion errors must expose their support reference.");

// --- OTP-verified vendor deletion with explicit Admin approval ---------
const [vendorDeletionScreenSource, vendorDeletionServiceSource, vendorDeletionAdminSource, vendorDeletionFunctionSource, vendorDeletionRequestFunctionSource, vendorDeletionMigrationSource, vendorDeletionConstraintSource, vendorNavigationSource, adminNavigationSourceForDeletion] = await Promise.all([
  read("app/VendorAccountDeletion.tsx"),
  read("services/accountDeletion.ts"),
  read("services/vendorDeletionAdmin.ts"),
  read("supabase/functions/admin-process-vendor-deletion/index.ts"),
  read("supabase/functions/request-vendor-deletion/index.ts"),
  read("supabase/migrations/20260906200000_vendor_deletion_approval_workflow.sql"),
  read("supabase/migrations/20260906204000_prevent_duplicate_active_vendor_deletions.sql"),
  read("vendor/navigation.ts"),
  read("admin/navigation.ts"),
]);
assert.match(vendorDeletionScreenSource, /sendVendorDeletionOtp/, "Vendor deletion must verify the registered email with OTP.");
assert.match(vendorDeletionScreenSource, /Your vendor profile remains active until an administrator reviews/, "Vendor deletion must clearly remain pending until Admin approval.");
assert.match(vendorDeletionScreenSource, /Deletion request pending/, "An active vendor deletion request must replace the submission form with a pending state.");
assert.match(vendorDeletionScreenSource, /Previous request rejected/, "A rejected request must explain that the vendor may submit again.");
assert.match(vendorDeletionServiceSource, /submitVerifiedVendorDeletion/, "The verified vendor request must use its authenticated Edge Function.");
assert.match(vendorDeletionServiceSource, /getVendorDeletionStatus/, "The vendor screen must be able to load its latest deletion status.");
assert.match(vendorDeletionRequestFunctionSource, /body\.action==='status'/, "The authenticated vendor deletion function must expose the caller's request status.");
assert.match(vendorDeletionConstraintSource, /unique index[\s\S]*status in \('pending', 'verified', 'processing'\)/, "The database must prevent concurrent active deletion requests while allowing retries after rejection.");
assert.match(vendorDeletionAdminSource, /verifyAdminSession/, "Admin deletion controls must require the fully verified Admin session.");
assert.match(vendorDeletionFunctionSource, /hasAal2\(token\)/, "The destructive Admin Edge Function must independently enforce MFA.");
assert.match(vendorDeletionFunctionSource, /auth\.admin\.deleteUser\(target\.profile_id\)/, "Approval must delete the vendor Auth identity.");
assert.match(vendorDeletionFunctionSource, /vendor_snapshot: null/, "Completed deletion requests must not retain the vendor snapshot.");
assert.match(vendorDeletionMigrationSource, /delete from public\.clips[\s\S]*delete from public\.vendor_applications[\s\S]*delete from public\.vendors/, "The approval transaction must remove restricted clips, application data and the vendor workspace in dependency order.");
assert.match(vendorNavigationSource, /\/VendorAccountDeletion/, "Vendor deletion must remain behind the vendor workspace route guard.");
assert.match(adminNavigationSourceForDeletion, /\/AdminVendorDeletionRequests/, "Admin deletion approval must remain behind the Admin route guard.");

const [adminNotificationScreenSource, adminNotificationServiceSource, deletionNotificationMigrationSource] = await Promise.all([
  read("app/AdminNotifications.tsx"),
  read("services/adminNotifications.ts"),
  read("supabase/migrations/20260906201000_admin_vendor_deletion_notifications.sql"),
]);
assert.match(deletionNotificationMigrationSource, /account_deletion_notify_admin/, "Verified vendor deletion requests must create an Admin notification at the database boundary.");
assert.match(deletionNotificationMigrationSource, /on conflict \(deletion_request_id\) do nothing/, "Vendor deletion retries must not create duplicate Admin notifications.");
assert.match(deletionNotificationMigrationSource, /account_deletion_resolve_admin_notification/, "Resolved deletion requests must also resolve their Admin notification.");
assert.match(adminNotificationServiceSource, /AdminVendorDeletionRequests\?requestId=/, "Deletion notifications must deep-link to the matching Admin request.");
assert.match(adminNotificationScreenSource, /markAdminNotificationRead/, "Opening an Admin notification must mark it read.");
const deletionServiceGrantSource = await read("supabase/migrations/20260906202000_grant_service_role_deletion_workflow.sql");
assert.match(deletionServiceGrantSource, /grant select, insert, update, delete on public\.account_deletion_requests to service_role/, "Deletion Edge Functions must have explicit service-role table privileges.");
assert.match(adminNotificationServiceSource, /admin-notification-inbox-\$\{Date\.now\(\)\}-\$\{subscriptionSequence\}/, "Each mounted Admin notification consumer must own a unique Realtime channel, including across hot reloads.");
const adminDeletionGrantSource = await read("supabase/migrations/20260906203000_grant_admin_deletion_request_access.sql");
assert.match(adminDeletionGrantSource, /grant select, update on public\.account_deletion_requests to authenticated/, "Admin request reads must have table grants in addition to restrictive RLS policies.");

// --- Browser authentication must survive tab changes -----------------
const supabaseClientSource = await read("services/supabase.ts");
assert.match(supabaseClientSource, /localStorage\.getItem\(key\)/, "Web authentication must restore from browser-persistent storage in every tab.");
assert.match(supabaseClientSource, /localStorage\.setItem\(key, value\)/, "Web authentication must persist refreshed sessions across tabs.");
assert.match(supabaseClientSource, /localStorage\.setItem\(key, legacyValue\)[\s\S]*sessionStorage\.removeItem\(key\)/, "Existing per-tab sessions must migrate once into persistent browser storage.");
assert.doesNotMatch(supabaseClientSource, /sessionStorage\.setItem\(key, value\)/, "New Supabase sessions must not be persisted only in one browser tab.");
assert.match(supabaseClientSource, /persistSession: true/, "Supabase must keep valid Public and Vendor sessions until explicit logout or server invalidation.");

// --- Installable Admin Portal PWA --------------------------------------
const [adminManifestSource, adminServiceWorkerSource, adminInstallControlSource, adminSidebarSource, adminProfileSource] = await Promise.all([
  read("public/admin-manifest.webmanifest"),
  read("public/admin-service-worker.js"),
  read("components/admin/AdminPwaInstallControl.tsx"),
  read("components/admin/AdminWorkspaceSidebar.tsx"),
  read("app/AdminProfile.tsx"),
]);
const adminManifest = JSON.parse(adminManifestSource);
assert.equal(adminManifest.name, "RoyalLagn Admin Portal", "The installed Admin PWA must have its own product name.");
assert.match(adminManifest.start_url, /^\/AdminLogin/, "The installed Admin PWA must start at the secure Admin entry route.");
assert.equal(adminManifest.display, "standalone", "The Admin PWA must open without browser chrome.");
assert.ok(adminManifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"), "The Admin PWA must provide a safe maskable icon.");
assert.match(adminServiceWorkerSource, /event\.respondWith\(fetch\(event\.request\)\)/, "The Admin service worker must satisfy installability with a functional network-only fetch handler.");
assert.match(adminInstallControlSource, /beforeinstallprompt/, "The Admin install control must use the browser's native install prompt.");
assert.match(adminInstallControlSource, /__royalLagnAdminInstallPrompt/, "The Admin install control must recover a native prompt captured before React mounts.");
assert.match(adminInstallControlSource, /appinstalled/, "The Admin install control must expose the installed state.");
assert.match(adminSidebarSource, /AdminPwaInstallControl/, "The Admin sidebar must expose the portal install action.");
assert.match(adminProfileSource, /showMobileNav[\s\S]*AdminPwaInstallControl/, "The compact Admin profile must expose the portal install action on phone and tablet web layouts.");

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
for (const guard of ["finance_budgets_closed_month_guard", "finance_budget_items_closed_month_guard", "finance_tax_records_closed_month_guard"]) {
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
