import type { Page, Route } from "@playwright/test";

const DUMMY_VENDOR_ID = "11111111-1111-4111-8111-111111111111";
const DUMMY_USER_ID = "22222222-2222-4222-8222-222222222222";

const json = (
  route: Route,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    headers,
    body: JSON.stringify(body),
  });

function dummySession() {
  const encoded = Buffer.from(
    JSON.stringify({
      sub: DUMMY_USER_ID,
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  const user = {
    id: DUMMY_USER_ID,
    email: "featured-vendor@example.test",
    role: "authenticated",
    aud: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: { role: "vendor", full_name: "Featured Vendor" },
    created_at: new Date().toISOString(),
  };
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${encoded}.dummy`,
    refresh_token: "dummy-refresh-token",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  };
}

export async function installMockAppUser(
  page: Page,
  role: "customer" | "vendor" | "admin",
) {
  const occupied = 0;
  const hasActivePlacement = false;
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error("EXPO_PUBLIC_SUPABASE_URL is required");
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const vendor = {
    id: DUMMY_VENDOR_ID,
    profile_id: DUMMY_USER_ID,
    business_name: "Shubh Moments Photography",
    owner_name: "Aarav Shah",
    is_verified: true,
    public_profile_enabled: true,
    management_status: "active",
    slug: "shubh-moments-photography",
    pincode: "411062",
    city: "Pune",
    state: "Maharashtra",
    contact_email: "featured-vendor@example.test",
    contact_phone: "9876543210",
    logo_url: null,
    categories: { name: "Photographer" },
  };
  const elitePlan = {
    id: "66666666-6666-4666-8666-666666666666",
    name: "Elite",
    slug: "elite",
    description: "Elite vendor membership",
    price: 14999,
    discounted_price: null,
    currency: "INR",
    billing_interval: "year",
    billing_interval_count: 1,
    duration_days: 365,
    trial_enabled: false,
    trial_days: 0,
    grace_period_days: 7,
    is_active: true,
    is_featured: true,
    display_order: 1,
    status: "active",
    is_permanent: false,
    subscription_plan_features: [],
    subscription_plan_billing_options: [],
  };
  const eliteAccess = {
    vendor_id: DUMMY_VENDOR_ID,
    subscription_id: "77777777-7777-4777-8777-777777777777",
    plan_id: elitePlan.id,
    plan_name: "Elite",
    status: "active",
    access_source: "paid_subscription",
    billing_interval: "year",
    price: 14999,
    currency: "INR",
    start_date: new Date(Date.now() - 355 * 24 * 60 * 60 * 1000).toISOString(),
    expiry_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    grace_period_end_date: null,
    trial_end_date: null,
    days_remaining: 10,
    has_access: true,
    access_reason: "paid_subscription",
    clip_limit: 100,
    clip_usage: 0,
    clip_remaining: 100,
    photo_limit: 500,
    photo_usage: 0,
    photo_remaining: 500,
    scheduled_plan_id: null,
    scheduled_plan_name: null,
    scheduled_billing_option_id: null,
    scheduled_change_at: null,
  };

  await page.route(`${supabaseUrl}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auth/v1/user"))
      return json(route, dummySession().user);
    if (url.pathname.endsWith("/auth/v1/token"))
      return json(route, dummySession());
    if (url.pathname.includes("/realtime/")) return route.abort();
    if (url.pathname.endsWith("/rest/v1/rpc/get_featured_inventory"))
      return json(route, [
        {
          pincode: "411062",
          capacity: 10,
          occupied,
          remaining: 10 - occupied,
          next_available_at: null,
        },
      ]);
    if (url.pathname.endsWith("/rest/v1/rpc/get_my_subscription_access"))
      return json(route, [eliteAccess]);
    if (url.pathname.endsWith("/rest/v1/rpc/refresh_my_subscription_access"))
      return json(route, {
        clip_active: 0,
        clip_locked: 0,
        photo_active: 0,
        photo_locked: 0,
      });
    if (url.pathname.endsWith("/rest/v1/rpc/get_my_subscription_entitlements"))
      return json(route, {});
    if (url.pathname.endsWith("/rest/v1/rpc/get_my_featured_placements"))
      return json(
        route,
        hasActivePlacement
          ? [
              {
                id: "44444444-4444-4444-8444-444444444444",
                vendor_id: DUMMY_VENDOR_ID,
                pincode: "411062",
                slot_number: 3,
                status: "active",
                reserved_until: null,
                starts_at: new Date(Date.now() - 60_000).toISOString(),
                ends_at: new Date(
                  Date.now() + 30 * 24 * 60 * 60 * 1000,
                ).toISOString(),
              },
            ]
          : [],
      );
    if (url.pathname.endsWith("/rest/v1/profiles"))
      return json(route, {
        id: DUMMY_USER_ID,
        email: vendor.contact_email,
        role: role === "customer" ? "public_user" : role === "admin" ? "admin" : "vendor",
        is_active: true,
        full_name: "Test Customer",
      });
    if (
      url.pathname.endsWith("/rest/v1/vendor_applications") &&
      role === "customer"
    )
      return json(route, []);
    if (url.pathname.endsWith("/rest/v1/vendor_applications"))
      return json(route, [
        {
          id: "33333333-3333-4333-8333-333333333333",
          status: "approved",
          rejection_reason: null,
          profile_id: DUMMY_USER_ID,
        },
      ]);
    if (url.pathname.endsWith("/rest/v1/subscription_plans"))
      return json(route, [elitePlan]);
    if (url.pathname.endsWith("/rest/v1/vendors") && role !== "vendor")
      return json(route, null);
    if (url.pathname.endsWith("/rest/v1/vendors")) {
      const select = url.searchParams.get("select") ?? "";
      return json(
        route,
        select === "id,is_verified,profile_id"
          ? { id: vendor.id, is_verified: true, profile_id: DUMMY_USER_ID }
          : vendor,
      );
    }
    if (url.pathname.endsWith("/rest/v1/featured_vendor_placements")) {
      if (url.searchParams.get("status") === "eq.active")
        return json(
          route,
          Array.from({ length: occupied }, (_, index) => ({
            vendor_id:
              hasActivePlacement && index === 2
                ? DUMMY_VENDOR_ID
                : `55555555-5555-4555-8555-${String(index + 1).padStart(12, "0")}`,
            slot_number: index + 1,
            ends_at: new Date(
              Date.now() + (index + 1) * 24 * 60 * 60 * 1000,
            ).toISOString(),
          })),
        );
      if (url.searchParams.get("vendor_id") === `eq.${DUMMY_VENDOR_ID}`)
        return json(
          route,
          hasActivePlacement
            ? [
                {
                  id: "44444444-4444-4444-8444-444444444444",
                  vendor_id: DUMMY_VENDOR_ID,
                  pincode: "411062",
                  slot_number: 3,
                  status: "active",
                  reserved_until: null,
                  starts_at: new Date(Date.now() - 60_000).toISOString(),
                  ends_at: new Date(
                    Date.now() + 30 * 24 * 60 * 60 * 1000,
                  ).toISOString(),
                },
              ]
            : [],
        );
      return json(route, []);
    }
    if (url.pathname.includes("/rest/v1/rpc/")) return json(route, []);
    if (url.pathname.includes("/rest/v1/")) {
      const wantsObject = route
        .request()
        .headers()
        .accept?.includes("application/vnd.pgrst.object");
      return json(route, wantsObject ? null : [], { "content-range": "0-0/0" });
    }
    return json(route, {});
  });

  await page.goto("/");
  await page.evaluate(
    ({ key, session }) => localStorage.setItem(key, JSON.stringify(session)),
    {
      key: `sb-${projectRef}-auth-token`,
      session: dummySession(),
    },
  );
}
