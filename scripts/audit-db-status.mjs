import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function checkDatabase() {
  console.log("Checking database connection to:", supabaseUrl);

  // 1. Check vendor_bookings columns
  const { data: cols, error: colErr } = await supabase
    .from("vendor_bookings")
    .select("id, event_start_at, cancellation_cutoff_at, customer_contact_number, customer_whatsapp_number, service_map_url, booking_description, contact_unlocked_at, emergency_status")
    .limit(1);

  if (colErr) {
    console.log("vendor_bookings columns check failed:", colErr.message);
  } else {
    console.log("vendor_bookings new columns are PRESENT in DB!");
  }

  // 2. Check booking_emergency_reports table
  const { data: reports, error: repErr } = await supabase
    .from("booking_emergency_reports")
    .select("id")
    .limit(1);

  if (repErr) {
    console.log("booking_emergency_reports table check failed:", repErr.message);
  } else {
    console.log("booking_emergency_reports table is PRESENT in DB!");
  }

  // 3. Check RPC get_secure_booking_details
  const { data: rpcData, error: rpcErr } = await supabase.rpc("get_secure_booking_details", {
    target_booking_id: "non_existent_test_booking_id"
  });

  if (rpcErr && rpcErr.message.includes("does not exist")) {
    console.log("RPC get_secure_booking_details is MISSING:", rpcErr.message);
  } else if (rpcErr) {
    console.log("RPC get_secure_booking_details response error:", rpcErr.message);
  } else {
    console.log("RPC get_secure_booking_details is PRESENT in DB! Result:", rpcData);
  }
}

checkDatabase().catch(console.error);
