import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function testFullEdgeDeletion() {
  console.log("--- TESTING FULL ACCOUNT DELETION FLOW VIA EDGE FUNCTION ---");
  const testEmail = `edge_full_del_${Date.now()}@royallagn.test`;

  // 1. Create user
  const { data: uData, error: uErr } = await supabaseAdmin.auth.admin.createUser({
    email: testEmail,
    email_confirm: true,
    user_metadata: { role: "public_user" },
  });
  if (uErr) throw uErr;
  const userId = uData.user.id;
  console.log("1. User created:", userId);

  // 2. Generate OTP token by signing in with OTP link or admin OTP
  // In Supabase Auth, admin can generate an OTP
  const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: testEmail,
  });
  if (linkErr) throw linkErr;

  // Sign in using the token_hash or email_otp
  const userClient = createClient(SUPABASE_URL, ANON_KEY);
  const { data: verifyData, error: vErr } = await userClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "email",
  });
  if (vErr) throw vErr;
  console.log("2. Signed in via OTP with fresh AMR:", verifyData.session?.user.id);

  // 3. Create profile
  const { data: prof, error: pErr } = await userClient.rpc("complete_public_registration", {
    full_name: "Full Edge Del Test",
    phone: "9876543210"
  });
  if (pErr) throw pErr;
  console.log("3. Profile created in DB:", prof.id);

  // 4. Invoke delete-customer-account
  console.log("4. Invoking delete-customer-account with fresh OTP session...");
  const { data: delResult, error: delError } = await userClient.functions.invoke("delete-customer-account");
  if (delError) {
    console.error("delete-customer-account FAILED:", delError);
    if (delError.context) {
      try {
        console.error("Response body:", await delError.context.json());
      } catch (e) {}
    }
  } else {
    console.log("delete-customer-account SUCCEEDED:", delResult);
  }

  // 5. Check if user still exists in auth.users
  const { data: checkUser, error: checkErr } = await supabaseAdmin.auth.admin.getUserById(userId);
  console.log("5. Auth user check after deletion:", checkUser?.user ? "STILL EXISTS" : "DELETED", checkErr?.message || "");

  // Cleanup if still exists
  if (checkUser?.user) {
    await supabaseAdmin.auth.admin.deleteUser(userId);
  }
}

testFullEdgeDeletion().catch(console.error);
