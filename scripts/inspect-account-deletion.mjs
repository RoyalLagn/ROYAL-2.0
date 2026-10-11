import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("--- 1. LISTING ALL AUTH USERS AND PROFILES ---");
  const { data: { users }, error: uErr } = await supabaseAdmin.auth.admin.listUsers();
  if (uErr) {
    console.error("Error listing users:", uErr);
    return;
  }
  console.log(`Total Auth Users: ${users.length}`);

  const { data: profiles, error: pErr } = await supabaseAdmin.from("profiles").select("id, email, role, full_name, created_at, updated_at");
  if (pErr) {
    console.error("Error listing profiles:", pErr);
    return;
  }
  console.log(`Total Profiles: ${profiles.length}`);

  const profileMap = new Map(profiles.map(p => [p.id, p]));
  const profileEmailMap = new Map(profiles.map(p => [(p.email || "").toLowerCase(), p]));

  const orphans = [];
  for (const u of users) {
    const p = profileMap.get(u.id);
    if (!p) {
      orphans.push({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        metadata: u.user_metadata,
      });
    }
  }

  console.log(`\n--- 2. ORPHANED AUTH USERS (In auth.users but NOT in public.profiles) [Count: ${orphans.length}] ---`);
  for (const o of orphans) {
    console.log(JSON.stringify(o, null, 2));

    // Check if any customer business records exist for this orphan
    const { data: bkg } = await supabaseAdmin.from("vendor_bookings").select("id, booking_id").eq("customer_id", o.id);
    const { data: refP } = await supabaseAdmin.from("referral_profiles").select("id, referral_code").eq("customer_id", o.id);
    const { data: refAttr } = await supabaseAdmin.from("referral_attributions").select("id").eq("referred_customer_id", o.id);
    const { data: refComm } = await supabaseAdmin.from("referral_commissions").select("id").eq("referrer_id", o.id);
    const { data: notifs } = await supabaseAdmin.from("customer_notifications").select("id").eq("customer_id", o.id);

    console.log(`  -> Bookings: ${bkg?.length || 0}, ReferralProfiles: ${refP?.length || 0}, ReferralAttribution: ${refAttr?.length || 0}, Commissions: ${refComm?.length || 0}, Notifications: ${notifs?.length || 0}`);
  }

  console.log("\n--- 3. CHECKING ALL FOREIGN KEYS REFERENCING auth.users and profiles ---");
  const { data: fkList, error: fkErr } = await supabaseAdmin.rpc("get_foreign_keys_for_audit").catch(() => ({ data: null }));
  if (!fkList) {
    // Query directly via raw SQL if possible, or query information_schema if an rpc exists or write query
    console.log("Direct FK RPC not present, checking via test function or query");
  }

}

main().catch(console.error);
