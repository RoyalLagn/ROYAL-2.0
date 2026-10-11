import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const targetId = "b35ba949-ae45-447e-96e6-c023bd1b7f09";
  console.log(`Checking all tables for references to ${targetId}...`);

  const tables = [
    "profiles",
    "vendors",
    "vendor_bookings",
    "booking_refund_requests",
    "customer_notifications",
    "vendor_notifications",
    "admin_notifications",
    "referral_profiles",
    "referral_attributions",
    "referral_commissions",
    "referral_payout_requests",
    "vendor_enquiries",
    "reviews",
    "clip_views",
    "account_deletion_requests",
    "favorite_vendors",
  ];

  for (const t of tables) {
    try {
      // Check common column names: id, customer_id, user_id, profile_id, referrer_id, viewer_id
      const { data, error } = await supabaseAdmin.from(t).select("*").limit(1);
      if (error) {
        // Table might not exist or error
        continue;
      }
      if (data && data.length > 0) {
        const cols = Object.keys(data[0]);
        for (const c of cols) {
          if (c.includes("id") || c.includes("user") || c.includes("customer") || c.includes("profile")) {
            const { data: match, error: mErr } = await supabaseAdmin.from(t).select("*").eq(c, targetId);
            if (!mErr && match && match.length > 0) {
              console.log(`FOUND in table "${t}" column "${c}":`, match);
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
  console.log("Check complete.");
}

main().catch(console.error);
