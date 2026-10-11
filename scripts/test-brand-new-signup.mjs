import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

async function getCurrentMobileAccountRole(client) {
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError || !userData.user) throw userError ?? new Error("Your verification session expired.");
  const { data: profile, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (error) throw error;
  return profile?.role ?? userData.user.user_metadata?.role ?? null;
}

async function testBrandNewSignup() {
  const testEmail = `brand_new_${Date.now()}@royallagn.test`;
  console.log("Simulating brand new signup for:", testEmail);

  // 1. sendSignupOtp
  const { data: otpData, error: otpErr } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    email_confirm: true,
    user_metadata: {
      role: "public_user",
      full_name: "Brand New User",
      phone: "9876543210",
      registration_pending: true
    }
  });

  // Now create a session as this user
  await supabaseAdmin.auth.admin.updateUserById(otpData.user.id, { password: "Password123!" });
  const userClient = createClient(SUPABASE_URL, ANON_KEY);
  await userClient.auth.signInWithPassword({
    email: testEmail,
    password: "Password123!"
  });

  // Now call getCurrentMobileAccountRole as OtpVerification does
  const role = await getCurrentMobileAccountRole(userClient);
  console.log("Returned role for BRAND NEW USER during OTP verification:", role);

  if (role === "public_user") {
    console.log(">>> RESULT: OtpVerification would THROW 'A Public account already exists for this email. Please log in instead.'!");
  } else {
    console.log(">>> RESULT: Allowed to proceed!");
  }

  // Cleanup
  await supabaseAdmin.auth.admin.deleteUser(otpData.user.id);
}

testBrandNewSignup().catch(console.error);
