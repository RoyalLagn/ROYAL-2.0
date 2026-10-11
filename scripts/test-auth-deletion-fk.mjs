import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("Testing create and delete test user in auth.users...");
  const testEmail = `test_del_${Date.now()}@royallagn.test`;
  const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    email_confirm: true,
    user_metadata: { role: "public_user", registration_pending: true }
  });
  if (cErr) {
    console.error("Create user failed:", cErr);
    return;
  }
  console.log("Created test user:", created.user.id, created.user.email);

  // Now create a profile for this user
  const { error: pErr } = await supabaseAdmin.from("profiles").insert({
    id: created.user.id,
    email: testEmail,
    role: "public_user",
    full_name: "Test Delete User",
    phone: "9999999999",
  });
  if (pErr) {
    console.error("Profile insert failed:", pErr);
  } else {
    console.log("Profile inserted successfully");
  }

  // Create a referral profile for this user
  const { error: rErr } = await supabaseAdmin.rpc("ensure_customer_referral_profile", {
    p_customer_id: created.user.id,
  });
  if (rErr) {
    console.error("Referral profile creation failed:", rErr);
  } else {
    console.log("Referral profile created successfully");
  }

  // Now try to delete this auth user using auth.admin.deleteUser
  console.log("Attempting auth.admin.deleteUser...");
  const { data: dData, error: dErr } = await supabaseAdmin.auth.admin.deleteUser(created.user.id, false);
  if (dErr) {
    console.error("Delete user FAILED:", dErr);
  } else {
    console.log("Delete user SUCCEEDED:", dData);
  }

  // Check if profile and referral profile still exist
  const { data: pCheck } = await supabaseAdmin.from("profiles").select("id").eq("id", created.user.id);
  const { data: rCheck } = await supabaseAdmin.from("referral_profiles").select("id").eq("customer_id", created.user.id);
  console.log("Remaining profiles:", pCheck?.length, "Remaining referral profiles:", rCheck?.length);
}

main().catch(console.error);
