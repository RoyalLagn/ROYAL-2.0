import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://fymdrjcinqvmjthdwrtd.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseServiceKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in environment");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testSchema() {
  console.log("Checking vendor_bookings...");
  const { data: bData, error: bErr } = await supabase
    .from("vendor_bookings")
    .select("id, booking_status, payment_status, soft_lock_expires_at, refund_status")
    .limit(1);
  if (bErr) console.error("vendor_bookings error:", bErr);
  else console.log("vendor_bookings OK! Sample length:", bData.length);

  console.log("Checking booking_refund_requests...");
  const { data: rData, error: rErr } = await supabase
    .from("booking_refund_requests")
    .select("id, booking_id, status, amount")
    .limit(1);
  if (rErr) console.error("booking_refund_requests error:", rErr);
  else console.log("booking_refund_requests OK! Count:", rData.length);

  console.log("Checking get_vendor_availability_calendar RPC...");
  const { data: vList } = await supabase.from("vendors").select("id").limit(1);
  if (vList && vList.length > 0) {
    const vId = vList[0].id;
    const { data: calData, error: calErr } = await supabase.rpc("get_vendor_availability_calendar", {
      target_vendor_id: vId,
      start_date: "2026-12-10",
      end_date: "2026-12-13"
    });
    if (calErr) console.error("RPC error:", calErr);
    else console.log("get_vendor_availability_calendar OK! Days returned:", calData.length, calData[0]);
  }
}

testSchema().catch(console.error);
