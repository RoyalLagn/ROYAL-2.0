import { expect, test, type Page, type Route } from "@playwright/test";

const DUMMY_VENDOR_ID = "11111111-1111-4111-8111-111111111111";
const DUMMY_USER_ID = "22222222-2222-4222-8222-222222222222";

const json = (route: Route, body: unknown, headers: Record<string, string> = {}) => route.fulfill({
  status: 200,
  contentType: "application/json",
  headers,
  body: JSON.stringify(body),
});

function dummySession() {
  const encoded = Buffer.from(JSON.stringify({ sub: DUMMY_USER_ID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const user = { id: DUMMY_USER_ID, email: "featured-vendor@example.test", role: "authenticated", aud: "authenticated",
    app_metadata: { provider: "email" }, user_metadata: { role: "vendor", full_name: "Featured Vendor" }, created_at: new Date().toISOString() };
  return { access_token: `eyJhbGciOiJIUzI1NiJ9.${encoded}.dummy`, refresh_token: "dummy-refresh-token", expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user };
}

async function installDummyVendor(page: Page, occupied = 5) {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("EXPO_PUBLIC_SUPABASE_URL is required");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const vendor = { id: DUMMY_VENDOR_ID, profile_id: DUMMY_USER_ID, business_name: "Shubh Moments Photography", owner_name: "Aarav Shah",
    is_verified: true, public_profile_enabled: true, management_status: "active", pincode: "411062", city: "Pune", state: "Maharashtra",
    contact_email: "featured-vendor@example.test", contact_phone: "9876543210", logo_url: null, categories: { name: "Photographer" } };

  await page.route(`${supabaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/v1/user")) return json(route, dummySession().user);
    if (url.pathname.endsWith("/auth/v1/token")) return json(route, dummySession());
    if (url.pathname.includes("/realtime/")) return route.abort();
    if (url.pathname.endsWith("/rest/v1/rpc/get_featured_inventory")) return json(route, [{ pincode: "411062", capacity: 10, occupied, remaining: 10 - occupied, next_available_at: null }]);
    if (url.pathname.endsWith("/rest/v1/profiles")) return json(route, { id: DUMMY_USER_ID, email: vendor.contact_email, role: "vendor", is_active: true });
    if (url.pathname.endsWith("/rest/v1/vendor_applications")) return json(route, [{ id: "33333333-3333-4333-8333-333333333333", status: "approved", rejection_reason: null, profile_id: DUMMY_USER_ID }]);
    if (url.pathname.endsWith("/rest/v1/vendors")) {
      const select = url.searchParams.get("select") ?? "";
      return json(route, select === "id,is_verified,profile_id" ? { id: vendor.id, is_verified: true, profile_id: DUMMY_USER_ID } : vendor);
    }
    if (url.pathname.endsWith("/rest/v1/featured_vendor_placements")) return json(route, []);
    if (url.pathname.includes("/rest/v1/rpc/")) return json(route, []);
    if (url.pathname.includes("/rest/v1/")) {
      const wantsObject = route.request().headers().accept?.includes("application/vnd.pgrst.object");
      return json(route, wantsObject ? null : [], { "content-range": "0-0/0" });
    }
    return json(route, {});
  });

  await page.goto("/");
  await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
    key: `sb-${projectRef}-auth-token`, session: dummySession(),
  });
}

test.describe("Paid PIN-code featured placement", () => {
  test("dummy vendor sees ₹999 offer and five remaining spots in 411062", async ({ page }) => {
    await installDummyVendor(page, 5);
    await page.goto("/VendorFeaturedPlacement");
    await expect(page.getByText("Be the first choice nearby")).toBeVisible();
    await expect(page.getByText("PIN 411062")).toBeVisible();
    await expect(page.getByText("5 spots remaining")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay ₹999 and feature my business in 411062" })).toBeEnabled();
  });

  test("the tenth slot closes checkout", async ({ page }) => {
    await installDummyVendor(page, 10);
    await page.goto("/VendorFeaturedPlacement");
    await expect(page.getByText("0 spots remaining")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay ₹999 and feature my business in 411062" })).toBeDisabled();
    await expect(page.getByText("All spots booked")).toBeVisible();
  });

  test("old admin featured-vendor route no longer exists", async ({ page }) => {
    await page.goto("/AdminFeaturedVendors");
    await expect(page.getByText("Top Featured Vendors")).toHaveCount(0);
    await expect(page).not.toHaveURL(/AdminFeaturedVendors$/);
  });
});
