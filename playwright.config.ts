import { defineConfig, devices } from "@playwright/test";

// Web-only E2E harness for the Admin PIN->Taluka mapping workflow and the
// vendor BecomeVendor flow that depends on it. Kept separate from the app's
// own RN/Expo TypeScript project (see tsconfig.json's "exclude") and from
// the credential-free scripts/test-*.mjs smoke suite -- like
// scripts/e2e-profile-propagation.mjs, this needs real Supabase test
// credentials in the environment and is never run as part of `npm run
// lint`/`tsc --noEmit`/`test:smoke`.
//
// Required environment variables (same convention as
// scripts/e2e-profile-propagation.mjs):
//   EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY
//   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD       -- an Admin account
//   E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD -- any signed-in app user
//     (BecomeVendor requires being signed in as a user with no vendor
//     application yet; it is not a public/anonymous form)
//   E2E_WEB_BASE_URL -- defaults to the local `npm run web` dev server
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_WEB_BASE_URL || "http://localhost:8082",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
