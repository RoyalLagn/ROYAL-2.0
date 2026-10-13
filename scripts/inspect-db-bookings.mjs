import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = fs.readFileSync(".env", "utf8");
function getEnv(key) {
  const match = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, "").trim() : "";
}

const url = getEnv("EXPO_PUBLIC_SUPABASE_URL");
const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
const client = createClient(url, key);

const { data: bList, error } = await client
  .from("vendor_bookings")
  .select("id, ticket_id, customer_name, vendor_id, booking_status, payment_status, created_at")
  .order("created_at", { ascending: false })
  .limit(10);

console.log("Error:", error);
console.log("Found bookings count:", bList?.length);
console.log("Recent bookings:", JSON.stringify(bList, null, 2));

const { data: v } = await client.from("vendors").select("id, business_name, slug").eq("slug", "tejas-photography-pune").single();
console.log("Tejas Photography Vendor:", v);

const { data: b } = await client.from("vendor_bookings").select("*").eq("ticket_id", "RL-56987").single();
console.log("Full booking record for RL-56987:", JSON.stringify(b, null, 2));

const expoKey = getEnv("EXPO_PUBLIC_RAZORPAY_KEY_ID");
const testKey = getEnv("RAZORPAY_TEST_KEY_ID");
const keySecret = getEnv("RAZORPAY_TEST_KEY_SECRET");
console.log("EXPO_PUBLIC_RAZORPAY_KEY_ID:", expoKey);
console.log("RAZORPAY_TEST_KEY_ID:", testKey);
const keyId = testKey || expoKey;

if (b?.razorpay_order_id && keyId && keySecret) {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const rzpRes = await fetch(`https://api.razorpay.com/v1/orders/${b.razorpay_order_id}/payments`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  console.log("Razorpay lookup status:", rzpRes.status);
  const rzpData = await rzpRes.json();
  console.log("Razorpay payments for order:", JSON.stringify(rzpData, null, 2));
}


