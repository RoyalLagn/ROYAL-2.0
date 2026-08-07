// Aggregate runner for the safe, non-credentialed local domain/smoke checks.
// Deliberately excludes `test:profile-e2e`, which needs staging Supabase
// credentials in `.env` and hits a real backend.
import { spawnSync } from "node:child_process";

const CHECKS = [
  { name: "profile-smoke", script: "scripts/smoke-profile-propagation.mjs", strip: false },
  { name: "subscriptions", script: "scripts/test-subscription-domain.mjs", strip: true },
  { name: "packages", script: "scripts/test-package-domain.mjs", strip: true },
  { name: "contacts", script: "scripts/test-contact-actions.mjs", strip: true },
  { name: "locations", script: "scripts/test-location-domain.mjs", strip: true },
  { name: "auth-validation", script: "scripts/test-auth-validation.mjs", strip: true },
  { name: "regression-guards", script: "scripts/test-regression-guards.mjs", strip: false },
];

let failures = 0;

for (const check of CHECKS) {
  const args = check.strip
    ? ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--experimental-strip-types", check.script]
    : [check.script];
  console.log(`\n--- ${check.name} ---`);
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) {
    failures += 1;
    console.error(`FAILED: ${check.name}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}

console.log("\nAll smoke checks passed.");
