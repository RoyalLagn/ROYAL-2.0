import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: "d:/new-royallagn/royal/.env" });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const customerId = "7697f772-11c0-4aa1-8a7c-f35698f32701"; // Hrushikesh More

  // Verify customer profile
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("id", customerId)
    .single();

  if (profErr || !profile) {
    console.error("Profile not found:", profErr);
    process.exit(1);
  }

  console.log(`Target Customer: ${profile.full_name} (${profile.email}, ${profile.phone})`);

  // Verify referral profile
  const { data: refProf, error: refErr } = await supabase
    .from("referral_profiles")
    .select("*")
    .eq("customer_id", customerId)
    .single();

  if (refErr || !refProf) {
    console.error("Referral profile not found:", refErr);
    process.exit(1);
  }

  console.log(`Referral Code: ${refProf.referral_code}`);
  console.log(`Current Available Balance: ₹${refProf.earned_balance}`);

  // Fetch a vendor to anchor the booking
  const { data: vendors, error: vErr } = await supabase
    .from("vendors")
    .select("id, business_name")
    .limit(1);

  if (vErr || !vendors || vendors.length === 0) {
    console.error("No vendor found:", vErr);
    process.exit(1);
  }

  const vendor = vendors[0];
  const testBookingId = `BK_TEST_DEP_${Date.now()}`;
  const testTicketId = `TCK-DEP-${Math.floor(1000 + Math.random() * 9000)}`;

  // 1. Insert confirmed booking record
  const { data: booking, error: bErr } = await supabase
    .from("vendor_bookings")
    .insert({
      vendor_id: vendor.id,
      customer_id: customerId,
      customer_name: profile.full_name,
      customer_phone: profile.phone || "8669505727",
      customer_email: profile.email,
      booking_id: testBookingId,
      ticket_id: testTicketId,
      event_date: "2026-11-25",
      start_date: "2026-11-25",
      end_date: "2026-11-25",
      total_days: 1,
      event_type: "Wedding Ceremony",
      package_title: "Royal Grand Celebration Package",
      package_price: 150000,
      total_amount: 150000,
      advance_amount: 50000,
      due_amount: 100000,
      booking_status: "confirmed",
      payment_status: "paid_advance",
      referral_code: refProf.referral_code,
      source: "online",
    })
    .select("id, booking_id, ticket_id")
    .single();

  if (bErr || !booking) {
    console.error("Failed to insert booking:", bErr);
    process.exit(1);
  }

  console.log(`Created Booking: ${booking.booking_id} (${booking.ticket_id})`);

  // 2. Insert earned referral commission of ₹10,000
  const { data: commission, error: cErr } = await supabase
    .from("referral_commissions")
    .insert({
      booking_id: booking.booking_id,
      booking_record_id: booking.id,
      ticket_id: booking.ticket_id,
      referrer_id: customerId,
      referral_code: refProf.referral_code,
      booking_total: 150000,
      advance_paid: 50000,
      remaining_due: 100000,
      commission_slab: "1,00,000+",
      referrer_reward: 10000, // ₹10,000 requested by user
      royallagn_commission: 5000,
      total_commission: 15000,
      status: "earned",
      payout_status: "unpaid",
    })
    .select("*")
    .single();

  if (cErr || !commission) {
    console.error("Failed to insert commission:", cErr);
    process.exit(1);
  }

  console.log(`Created Earned Commission: ₹${commission.referrer_reward}`);

  // 3. Reconcile balances
  const { data: updatedBalances, error: rErr } = await supabase.rpc(
    "reconcile_referral_profile_balances",
    { p_customer_id: customerId }
  );

  if (rErr) {
    console.error("Failed to reconcile balances:", rErr);
    process.exit(1);
  }

  console.log("\n========================================================");
  console.log("SUCCESSFULLY CREDITED REFERRAL WALLET MONEY!");
  console.log("========================================================");
  console.log(`Customer: ${profile.full_name}`);
  console.log(`Available for Withdrawal: ₹${updatedBalances.earned_balance}`);
  console.log(`In Progress / Reserved:   ₹${updatedBalances.reserved_balance}`);
  console.log(`Total Paid Out:          ₹${updatedBalances.total_paid_out}`);
  console.log(`Total Earned Referrals:  ${updatedBalances.successful_referrals}`);
  console.log("========================================================");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
