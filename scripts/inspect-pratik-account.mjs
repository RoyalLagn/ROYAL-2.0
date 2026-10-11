import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("Searching for pratikdada7666@gmail.com across all tables...");
  const targetEmail = "pratikdada7666@gmail.com";

  const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
  const matchedUsers = users.filter(u => (u.email || "").toLowerCase() === targetEmail);
  console.log(`Matched Auth Users (${matchedUsers.length}):`);
  for (const u of matchedUsers) {
    console.log(JSON.stringify(u, null, 2));

    const { data: profile } = await supabaseAdmin.from("profiles").select("*").eq("id", u.id);
    console.log("Profiles by ID:", profile);

    const { data: refProfile } = await supabaseAdmin.from("referral_profiles").select("*").eq("customer_id", u.id);
    console.log("Referral Profiles by ID:", refProfile);

    const { data: refAttr } = await supabaseAdmin.from("referral_attributions").select("*").eq("referred_customer_id", u.id);
    console.log("Referral Attributions as referred:", refAttr);

    const { data: refAttr2 } = await supabaseAdmin.from("referral_attributions").select("*").eq("referrer_customer_id", u.id);
    console.log("Referral Attributions as referrer:", refAttr2);

    const { data: bookings } = await supabaseAdmin.from("vendor_bookings").select("id, booking_id, customer_name, customer_email, customer_phone").eq("customer_id", u.id);
    console.log("Bookings by customer_id:", bookings);

    const { data: enquiries } = await supabaseAdmin.from("vendor_enquiries").select("id, customer_name, customer_email").eq("customer_id", u.id);
    console.log("Enquiries by customer_id:", enquiries);

    const { data: reviews } = await supabaseAdmin.from("reviews").select("id").eq("profile_id", u.id);
    console.log("Reviews by profile_id:", reviews);

    const { data: notifs } = await supabaseAdmin.from("customer_notifications").select("id").eq("customer_id", u.id);
    console.log("Notifications by customer_id:", notifs);
  }

  const { data: profileByEmail } = await supabaseAdmin.from("profiles").select("*").eq("email", targetEmail);
  console.log("\nProfiles by Email:", profileByEmail);

  const { data: delReqs } = await supabaseAdmin.from("account_deletion_requests").select("*").eq("email", targetEmail);
  console.log("\nAccount deletion requests by Email:", delReqs);
}

main().catch(console.error);
