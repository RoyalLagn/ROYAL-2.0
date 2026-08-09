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

// --- App alerts must stay cross-platform and app-wide -------------------
const [dialogProviderSource, alertBridgeSource] = await Promise.all([
  read("components/dialogs/AppDialogProvider.tsx"),
  read("utils/webAlert.ts"),
]);
assert.match(layoutSource, /<AppDialogProvider>/, "The root layout must mount the shared app dialog provider.");
assert.match(layoutSource, /installAppAlert\(\)/, "The root layout must install the app-wide Alert bridge before screens render.");
assert.match(alertBridgeSource, /Alert\.alert\s*=/, "The shared bridge must continue routing existing Alert.alert calls.");
assert.match(dialogProviderSource, /Platform\.OS === "android" \? 48 : 44/, "Dialog actions must keep platform-appropriate touch targets.");

// --- NativeWind Pressable interop must retain Home control layout -------
// react-native-css-interop 0.2.1 consumes a function-valued Pressable style
// before React Native can evaluate it on Android. These Home controls must
// therefore keep static style arrays and track pressed/hovered state through
// event handlers, or their absolute/flex layout falls back to normal flow.
const NATIVE_PRESSABLE_HOME_PATHS = [
  "app/(tabs)/index.tsx",
  "components/home/HeroCarousel.tsx",
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
const publicProfileSource = await read("app/(tabs)/profile.tsx");
assert.match(
  publicProfileSource,
  /import Pressable from ["']@\/components\/InteropSafePressable["'];/,
  "Public Profile rows must resolve callback styles before NativeWind native interop.",
);
assert.doesNotMatch(
  publicProfileSource,
  /import \{[^}]*\bPressable\b[^}]*\} from ["']react-native["'];/,
  "Public Profile must not bypass the Android-safe Pressable wrapper.",
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
  assert.match(
    source,
    /behavior=\{Platform\.OS === ["']ios["'] \? ["']padding["'] : ["']height["']\}/,
    `${path} must keep an explicit Android KeyboardAvoidingView behavior (not undefined).`,
  );
  assert.match(
    source,
    /keyboardShouldPersistTaps=["']handled["']/,
    `${path} must keep keyboardShouldPersistTaps="handled" so taps reach controls while the keyboard is open.`,
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
assert.ok(
  (enquiriesSource.match(/accessibilityRole=["']radio["']/g) ?? []).length >= 3,
  "VendorEnquiries filters, sorting, and lead statuses must remain radio groups.",
);
assert.match(
  enquiriesSource,
  /filterTouchTarget: \{ minWidth: 44, minHeight: 44/,
  "VendorEnquiries filter targets must remain at least 44x44.",
);
assert.match(
  enquiriesSource,
  /sortTouchTarget: \{ minWidth: 44, minHeight: 44/,
  "VendorEnquiries sort targets must remain at least 44x44.",
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

console.log("Regression guard checks passed.");
