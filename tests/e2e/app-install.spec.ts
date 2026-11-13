import { test, expect } from "@playwright/test";
import { installMockAppUser } from "./helpers/mockAppUser";

for (const role of ["customer", "vendor"] as const) {
  test(`${role} profile opens the correct PWA installer`, async ({
    page,
  }, testInfo) => {
    await installMockAppUser(page, role);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(role === "vendor" ? "/Vendors_dash_profile" : "/profile");
    const label =
      role === "vendor" ? "Install Vendor App" : "Install RoyalLagn App";
    const button = page.getByRole("button", { name: label, exact: true });
    await expect(button).toBeVisible();
    await expect(page.getByTestId("page-loader")).toBeHidden();
    await button.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`${role}-profile-install-mobile.png`),
    });
    await button.click();
    await expect(page).toHaveURL(
      new RegExp(
        role === "vendor" ? "/vendor-install.html$" : "/install-app.html$",
      ),
    );
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    const manifestPath =
      role === "vendor"
        ? "/vendor-manifest.webmanifest"
        : "/manifest.webmanifest";
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      "href",
      manifestPath,
    );
    const manifest = await (await page.request.get(manifestPath)).json();
    expect(manifest.start_url).toBe(
      role === "vendor" ? "/vendor-dashboard?source=pwa" : "/?source=pwa",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: testInfo.outputPath(`${role}-pwa-install-mobile.png`),
    });
    await page.evaluate(() => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(event, {
        prompt: async () => {},
        userChoice: Promise.resolve({ outcome: "accepted" }),
      });
      window.dispatchEvent(event);
    });
    await page
      .getByRole("button", { name: "Install App", exact: true })
      .click();
    await expect(page.getByRole("status")).toHaveText(
      "Installation requested. Open the app from your Home Screen.",
    );
  });
}

test("vendor desktop sidebar and profile use the same install prompt", async ({
  page,
}) => {
  await installMockAppUser(page, "vendor");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/Vendors_dash_profile");
  await expect(
    page.getByRole("button", { name: "Install Vendor App", exact: true }),
  ).toHaveCount(2);
  await page.evaluate(() => {
    const browser = window as any;
    browser.__installCalls = 0;
    browser.__royalLagnAppInstallPrompt = {
      role: "vendor",
      event: {
        prompt: async () => {
          browser.__installCalls++;
        },
        userChoice: Promise.resolve({ outcome: "accepted" }),
      },
    };
    window.dispatchEvent(new Event("royallagn-app-install-ready"));
  });
  await page
    .getByRole("button", { name: "Install Vendor App", exact: true })
    .first()
    .click();
  expect(await page.evaluate(() => (window as any).__installCalls)).toBe(1);
  await expect(
    page.getByRole("button", { name: "App installed", exact: true }),
  ).toBeDisabled();
});

test("customer desktop profile exposes install and accepts a native prompt", async ({
  page,
}) => {
  await installMockAppUser(page, "customer");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/profile");
  const button = page.getByRole("button", {
    name: "Install RoyalLagn App",
    exact: true,
  });
  await expect(button).toBeVisible();
  await page.evaluate(() => {
    (window as any).__royalLagnAppInstallPrompt = {
      role: "customer",
      event: {
        prompt: async () => {},
        userChoice: Promise.resolve({ outcome: "accepted" }),
      },
    };
    window.dispatchEvent(new Event("royallagn-app-install-ready"));
  });
  await button.click();
  await expect(
    page.getByRole("button", { name: "App installed", exact: true }),
  ).toBeDisabled();
});

test("vendor mobile drawer contains the install action", async ({ page }) => {
  await installMockAppUser(page, "vendor");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/vendor-dashboard");
  await page.getByRole("button", { name: "Open Menu", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Install Vendor App", exact: true }),
  ).toBeVisible();
});
