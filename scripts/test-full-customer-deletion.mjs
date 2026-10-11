import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("--- TESTING FULL CUSTOMER DELETION VIA auth.admin.deleteUser ---");
  const testEmail = `cust_del_test_${Date.now()}@royallagn.test`;

  // 1. Create auth user
  const { data: uData, error: uErr } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    email_confirm: true,
    user_metadata: { role: "public_user" }
  });
  if (uErr) {
    console.error("Create user failed:", uErr);
    return;
  }
  const userId = uData.user.id;
  console.log("1. Created Auth User:", userId, testEmail);

  // 2. Insert profile via RPC or direct (using service role with bypass or complete_public_registration)
  // Let's sign in as user to get token and call complete_public_registration
  const { data: signin, error: sErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: testEmail
  });
  
  // Or insert profile using admin SQL: let's test if we can insert profile directly or via rpc
  // Wait, let's create a temporary user session:
  const anonClient = createClient(SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  // We can sign in with OTP or password
  await supabaseAdmin.auth.admin.updateUserById(userId, { password: "TestPassword123!" });
  const { data: authSession, error: lErr } = await anonClient.auth.signInWithPassword({
    email: testEmail,
    password: "TestPassword123!"
  });
  if (lErr) {
    console.error("Sign in failed:", lErr);
    return;
  }
  console.log("2. Signed in as test customer");

  // Call complete_public_registration
  const { data: prof, error: pErr } = await anonClient.rpc("complete_public_registration", {
    full_name: "Test Deletion Customer",
    phone: "9876543210"
  });
  if (pErr) {
    console.error("complete_public_registration failed:", pErr);
    return;
  }
  console.log("3. Created Profile & Referral Profile:", prof.id, prof.referral_code);

  // 4. Verify referral profile exists
  const { data: refProf } = await supabaseAdmin.from("referral_profiles").select("*").eq("customer_id", userId);
  console.log("4. Referral profile in DB:", refProf?.length > 0 ? "YES" : "NO");

  // 5. Insert a booking for this customer
  const { data: vendor } = await supabaseAdmin.from("vendors").select("id").limit(1).single();
  const { data: booking, error: bErr } = await supabaseAdmin.from("vendor_bookings").insert({
    booking_id: `del_test_bkg_${Date.now()}`,
    ticket_id: "RL-DELTEST",
    vendor_id: vendor.id,
    customer_id: userId,
    customer_name: "Test Deletion Customer",
    customer_phone: "9876543210",
    event_date: "2026-12-31",
    total_days: 1,
    event_type: "Wedding",
    package_title: "Test Package",
    package_price: 10000,
    total_amount: 10000,
    advance_amount: 3000,
    due_amount: 7000,
    booking_status: "confirmed",
    payment_status: "paid_advance",
    source: "online"
  }).select().single();
  if (bErr) {
    console.error("Booking insert failed:", bErr);
  } else {
    console.log("5. Created Booking:", booking.id);
  }

  // 6. Call prepare_customer_account_deletion
  const { error: prepErr } = await anonClient.rpc("prepare_customer_account_deletion");
  if (prepErr) {
    console.error("prepare_customer_account_deletion failed:", prepErr);
  } else {
    console.log("6. prepare_customer_account_deletion SUCCEEDED");
  }

  // 7. Now attempt auth.admin.deleteUser(userId, false)
  console.log("7. Calling auth.admin.deleteUser...");
  const { data: delResult, error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId, false);
  if (delErr) {
    console.error(">>> auth.admin.deleteUser FAILED:", delErr);
  } else {
    console.log(">>> auth.admin.deleteUser SUCCEEDED:", delResult);
  }

  // Check what remains in tables
  const { data: pAfter } = await supabaseAdmin.from("profiles").select("id").eq("id", userId);
  const { data: rAfter } = await supabaseAdmin.from("referral_profiles").select("id").eq("customer_id", userId);
  const { data: bAfter } = await supabaseAdmin.from("vendor_bookings").select("id, customer_id, customer_name").eq("id", booking?.id);

  console.log("Remaining profiles:", pAfter?.length);
  console.log("Remaining referral profiles:", rAfter?.length);
  console.log("Remaining booking:", bAfter);

  // Cleanup booking if still there
  if (booking) {
    await supabaseAdmin.from("vendor_bookings").delete().eq("id", booking.id);
  }
}

main().catch(console.error);
