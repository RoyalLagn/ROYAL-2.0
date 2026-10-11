import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

async function testEdgeFunctionAccountDeletion() {
  console.log("--- TESTING delete-customer-account EDGE FUNCTION ---");
  const testEmail = `edge_del_${Date.now()}@royallagn.test`;

  // 1. Create user
  const { data: uData, error: uErr } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    email_confirm: true,
    user_metadata: { role: "public_user" },
    password: "Password123!"
  });
  if (uErr) {
    console.error("User creation failed:", uErr);
    return;
  }
  const userId = uData.user.id;
  console.log("1. Created user:", userId);

  // 2. Sign in as user
  const userClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: loginData, error: lErr } = await userClient.auth.signInWithPassword({
    email: testEmail,
    password: "Password123!"
  });
  if (lErr) {
    console.error("Login failed:", lErr);
    return;
  }
  console.log("2. Signed in, got session token");

  // 3. Create profile
  const { data: prof, error: pErr } = await userClient.rpc("complete_public_registration", {
    full_name: "Edge Del Test",
    phone: "9876543210"
  });
  if (pErr) {
    console.error("Profile creation failed:", pErr);
    return;
  }
  console.log("3. Profile created:", prof.id);

  // 4. Now invoke delete-customer-account without fresh OTP token (to see response)
  console.log("4. Invoking delete-customer-account with standard password token...");
  const { data: res1, error: err1 } = await userClient.functions.invoke("delete-customer-account");
  console.log("Result without fresh OTP:", { data: res1, error: err1 });

  // 5. Clean up test user
  await supabaseAdmin.auth.admin.deleteUser(userId);
}

testEdgeFunctionAccountDeletion().catch(console.error);
