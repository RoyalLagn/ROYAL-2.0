import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
function getEnv(key) {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "") : "";
}

const url = getEnv("EXPO_PUBLIC_SUPABASE_URL");
const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const client = createClient(url, key);

// Finalize RL-56987 with test payment
const { data, error } = await client.rpc("finalize_verified_booking_payment", {
  p_booking_id: "bb9f99eb-89a4-4158-92ec-1548af78fde9",
  p_payment_id: "pay_test_RL56987",
  p_order_id: "order_TnNvVq0eUy4dGb",
  p_method: "upi",
});

console.log("RPC result data:", data);
console.log("RPC result error:", error);

// 1. Verify vendor_bookings row
const { data: b } = await client
  .from("vendor_bookings")
  .select("id, ticket_id, booking_status, payment_status, razorpay_payment_id, razorpay_order_id, advance_amount")
  .eq("ticket_id", "RL-56987")
  .single();
console.log("Updated Booking RL-56987:", b);

// 2. Verify vendor_notifications
const { data: vn } = await client
  .from("vendor_notifications")
  .select("id, title, body, kind, target_path, is_read, created_at")
  .eq("vendor_id", "fcd040b3-8caa-4d1a-9c5c-bb287db4e015")
  .order("created_at", { ascending: false })
  .limit(2);
console.log("Latest Vendor Notifications for Tejas Photography:", vn);

// 3. Verify admin_notifications
const { data: an } = await client
  .from("admin_notifications")
  .select("id, title, body, kind, target_path, is_read, created_at")
  .order("created_at", { ascending: false })
  .limit(2);
console.log("Latest Admin Notifications:", an);

// 4. Verify customer_notifications
const { data: cn } = await client
  .from("customer_notifications")
  .select("id, title, message, target_path, is_read, created_at")
  .eq("customer_id", "7697f772-11c0-4aa1-8a7c-f35698f32701")
  .order("created_at", { ascending: false })
  .limit(2);
console.log("Latest Customer Notifications for Hrushikesh More:", cn);

