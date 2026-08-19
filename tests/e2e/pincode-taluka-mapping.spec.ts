import { test, expect, type Page } from "@playwright/test";

// End-to-end coverage for the "Taluka toggle is the single source of truth
// for new vendor applications" rule -- Admin side (AdminGeoLocations) and
// Vendor side (BecomeVendor). Mirrors scripts/e2e-profile-propagation.mjs's
// credential convention: nothing here runs without real test accounts, and
// no password is ever hardcoded in source.
//
// There is deliberately no "confirm this PIN" Admin action to test here: a
// vendor can already apply the moment a Taluka is toggled ON, using
// whichever locality/Taluka match already exists (official or not) -- the
// only Admin-facing control is the accept/pause switch itself.
//
// Required environment variables (put them in a local, untracked .env.e2e
// and run `npx dotenv -e .env.e2e -- npx playwright test`, or export them
// in the shell/CI):
//   E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
//     -- an Administrator account (profiles.role in admin/super_admin).
//   E2E_CUSTOMER_EMAIL, E2E_CUSTOMER_PASSWORD
//     -- any signed-in app user with no existing vendor application.
//     BecomeVendor is not a public/anonymous form -- it requires sign-in.
//   E2E_TEST_PINCODE (default "410507")
//   E2E_TEST_STATE (default "Maharashtra")
//   E2E_TEST_DISTRICT (default "Pune")
//   E2E_TEST_TALUKA (default "Maval")
//
// This suite never fabricates or reuses the production Admin's real
// credentials -- it only ever authenticates using whatever E2E_* account the
// environment supplies, exactly like the existing test:profile-e2e script.

const PINCODE = process.env.E2E_TEST_PINCODE || "410507";
const STATE_NAME = process.env.E2E_TEST_STATE || "Maharashtra";
const DISTRICT_NAME = process.env.E2E_TEST_DISTRICT || "Pune";
const TALUKA_NAME = process.env.E2E_TEST_TALUKA || "Maval";

/** expo/no-dynamic-env-var forbids `process.env[name]` -- each caller passes
 * its own literal `process.env.WHATEVER` value in directly instead of a
 * variable name, so this stays a plain non-empty-string guard. */
const requireEnv = (label: string, value: string | undefined): string => {
  if (!value) test.skip(true, `Missing required env var ${label} -- see file header for the full list.`);
  return value ?? "";
};

async function loginAsAdmin(page: Page) {
  const email = requireEnv("E2E_ADMIN_EMAIL", process.env.E2E_ADMIN_EMAIL);
  const password = requireEnv("E2E_ADMIN_PASSWORD", process.env.E2E_ADMIN_PASSWORD);
  await page.goto("/AdminLogin");
  await page.getByPlaceholder("royallagn@gmail.com").fill(email);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: "Login" }).click();
  await page.waitForURL(/admin-dashboard|AdminMfaVerify|AdminMfaSetup/, { timeout: 20_000 });
  // Dev MFA bypass is enabled in this environment (ADMIN_MFA_DEV_BYPASS_ENABLED);
  // if a real environment requires MFA, complete it here before continuing.
  if (/AdminMfa/.test(page.url())) {
    test.skip(true, "Admin MFA is required in this environment -- extend this helper to complete it before re-running.");
  }
}

async function loginAsCustomer(page: Page) {
  const email = requireEnv("E2E_CUSTOMER_EMAIL", process.env.E2E_CUSTOMER_EMAIL);
  const password = requireEnv("E2E_CUSTOMER_PASSWORD", process.env.E2E_CUSTOMER_PASSWORD);
  await page.goto("/Login");
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.getByRole("button", { name: /log ?in|sign ?in/i }).click();
  await page.waitForLoadState("networkidle");
}

test.describe("Admin: the Taluka accept/pause switch is the only control", () => {
  test("turning a Taluka ON needs no further per-PIN action", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/AdminGeoLocations");

    await page.getByLabel("Choose State").click();
    await page.getByRole("menuitem", { name: STATE_NAME }).click();
    await page.getByLabel("Choose District").click();
    await page.getByRole("menuitem", { name: DISTRICT_NAME }).click();

    const talukaSwitch = page.getByRole("switch", { name: new RegExp(`new vendor applications from ${TALUKA_NAME}`, "i") });
    await expect(talukaSwitch).toBeVisible({ timeout: 15_000 });
    if ((await talukaSwitch.getAttribute("aria-checked")) !== "true") {
      await talukaSwitch.click();
    }
    await expect(talukaSwitch).toHaveAttribute("aria-checked", "true", { timeout: 10_000 });
  });
});

test.describe("Vendor: BecomeVendor uses whatever mapping already exists automatically", () => {
  test(`${PINCODE} + a selected locality enables Submit once ${TALUKA_NAME} is ON`, async ({ page }) => {
    await loginAsCustomer(page);
    await page.goto("/BecomeVendor");

    await page.getByPlaceholder("6-digit Indian PIN").fill(PINCODE);
    await page.getByRole("button", { name: "Verify" }).click();

    // Multiple post offices under one Taluka still require an explicit
    // locality choice (address specificity), but once one is picked, an
    // unofficial-source match is enough -- no Admin action was needed.
    const localityOption = page.getByRole("radio").first();
    await localityOption.click();
    await expect(page.getByText(/needs to be verified by RoyalLagn/i)).toHaveCount(0);

    await page.getByLabel("Business Name").fill("E2E Test Business");
    await page.getByLabel("Owner Name").fill("E2E Test Owner");
    await page.getByLabel("Email").fill(`e2e-vendor-${Date.now()}@example.com`);
    await page.getByLabel("Mobile Number").fill("9876543210");
    await page.getByText("Select business category").click();
    await page.getByRole("radio").first().click(); // first available category
    await page.getByLabel("Years of Experience").fill("3");
    await page.getByLabel("Business Description").fill("E2E test description for automated PIN/Taluka verification.");
    await page.getByText(/Terms/i).first().click();

    const submitButton = page.getByRole("button", { name: "Submit Application" });
    await expect(submitButton).toHaveAttribute("aria-disabled", "false", { timeout: 10_000 });

    // Deliberately does not click Submit -- this suite verifies eligibility
    // (button becomes enabled), not that it creates a real application row.
  });

  test(`${TALUKA_NAME} OFF blocks a new application from the same PIN`, async ({ page }) => {
    // Assumes an Admin has toggled the Taluka's "accept new applications"
    // switch off (see the Admin describe block above) before this runs. It
    // only asserts the vendor-facing consequence.
    await loginAsCustomer(page);
    await page.goto("/BecomeVendor");
    await page.getByPlaceholder("6-digit Indian PIN").fill(PINCODE);
    await page.getByRole("button", { name: "Verify" }).click();

    const localityOption = page.getByRole("radio").first();
    if (await localityOption.isVisible().catch(() => false)) {
      await localityOption.click();
    }

    await expect(
      page.getByText(new RegExp(`not currently accepting new vendor applications from ${TALUKA_NAME}`, "i")),
    ).toBeVisible({ timeout: 10_000 });
  });
});
