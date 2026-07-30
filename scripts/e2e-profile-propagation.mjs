import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const required = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "E2E_CUSTOMER_EMAIL",
  "E2E_CUSTOMER_PASSWORD",
  "E2E_VENDOR_EMAIL",
  "E2E_VENDOR_PASSWORD",
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_PASSWORD",
];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing E2E environment variables: ${missing.join(", ")}`);
  process.exit(2);
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const client = () => createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const customer = client();
const vendor = client();
const admin = client();
const anonymous = client();

const login = async (instance, email, password) => {
  const { data, error } = await instance.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw error ?? new Error("Unable to authenticate E2E account");
  return data.user;
};

const waitForChange = async (instance, table, filter, mutate) => {
  const channel = instance.channel(`e2e-${table}-${crypto.randomUUID()}`);
  let subscribed;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Realtime subscription timed out for ${table}`)), 10_000);
    subscribed = () => {
      clearTimeout(timer);
      resolve();
    };
  });
  const changed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Realtime update timed out for ${table}`)), 12_000);
    channel.on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table,
      filter,
    }, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") subscribed();
  });
  try {
    await ready;
    await mutate();
    return await changed;
  } finally {
    await instance.removeChannel(channel);
  }
};

const customerUser = await login(
  customer,
  process.env.E2E_CUSTOMER_EMAIL,
  process.env.E2E_CUSTOMER_PASSWORD,
);
const vendorUser = await login(
  vendor,
  process.env.E2E_VENDOR_EMAIL,
  process.env.E2E_VENDOR_PASSWORD,
);
await login(admin, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);

const { data: customerProfile, error: customerLoadError } = await customer
  .from("profiles")
  .select("id,full_name,phone")
  .eq("id", customerUser.id)
  .single();
if (customerLoadError) throw customerLoadError;

const { data: vendorProfile, error: vendorLoadError } = await vendor
  .from("vendors")
  .select("id,profile_id,business_name,owner_name,profile_views")
  .eq("profile_id", vendorUser.id)
  .single();
if (vendorLoadError) throw vendorLoadError;

const marker = Date.now().toString(36);
const nextCustomerName = `${customerProfile.full_name} ${marker}`.slice(0, 120);
const nextBusinessName = `${vendorProfile.business_name} ${marker}`.slice(0, 120);
const nextOwnerName = `${vendorProfile.owner_name} ${marker}`.slice(0, 120);

try {
  const customerEvent = await waitForChange(
    customer,
    "profiles",
    `id=eq.${customerUser.id}`,
    async () => {
      const { error } = await customer
        .from("profiles")
        .update({ full_name: nextCustomerName })
        .eq("id", customerUser.id);
      if (error) throw error;
    },
  );
  assert.equal(customerEvent.new.full_name, nextCustomerName);

  const { data: adminCustomer, error: adminCustomerError } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", customerUser.id)
    .single();
  if (adminCustomerError) throw adminCustomerError;
  assert.equal(adminCustomer.full_name, nextCustomerName);

  const vendorEvent = await waitForChange(
    vendor,
    "vendors",
    `id=eq.${vendorProfile.id}`,
    async () => {
      const { error } = await vendor.rpc("update_vendor_public_profile", {
        changes: { business_name: nextBusinessName, owner_name: nextOwnerName },
      });
      if (error) throw error;
    },
  );
  assert.equal(vendorEvent.new.business_name, nextBusinessName);
  assert.equal(vendorEvent.new.owner_name, nextOwnerName);

  const [{ data: publicVendor, error: publicError }, { data: adminVendor, error: adminVendorError }] =
    await Promise.all([
      anonymous.from("vendors").select("business_name,owner_name").eq("id", vendorProfile.id).single(),
      admin.from("vendors").select("business_name,owner_name").eq("id", vendorProfile.id).single(),
    ]);
  if (publicError) throw publicError;
  if (adminVendorError) throw adminVendorError;
  assert.equal(publicVendor.business_name, nextBusinessName);
  assert.equal(adminVendor.business_name, nextBusinessName);
  assert.equal(adminVendor.owner_name, nextOwnerName);

  const { data: linkedIdentity, error: linkedIdentityError } = await vendor
    .from("profiles")
    .select("full_name")
    .eq("id", vendorUser.id)
    .single();
  if (linkedIdentityError) throw linkedIdentityError;
  assert.equal(linkedIdentity.full_name, nextOwnerName);

  const viewEvent = await waitForChange(
    vendor,
    "vendors",
    `id=eq.${vendorProfile.id}`,
    async () => {
      const { error } = await anonymous.rpc("record_vendor_profile_view", {
        target_vendor_id: vendorProfile.id,
      });
      if (error) throw error;
    },
  );
  assert.equal(Number(viewEvent.new.profile_views), Number(vendorProfile.profile_views) + 1);

  console.log("Authenticated profile propagation E2E test passed.");
} finally {
  await customer
    .from("profiles")
    .update({ full_name: customerProfile.full_name, phone: customerProfile.phone })
    .eq("id", customerUser.id);
  await vendor.rpc("update_vendor_public_profile", {
    changes: {
      business_name: vendorProfile.business_name,
      owner_name: vendorProfile.owner_name,
    },
  });
  await Promise.all([
    customer.auth.signOut({ scope: "local" }),
    vendor.auth.signOut({ scope: "local" }),
    admin.auth.signOut({ scope: "local" }),
  ]);
}
