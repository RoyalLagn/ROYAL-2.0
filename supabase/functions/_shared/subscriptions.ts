import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-razorpay-signature, x-razorpay-event-id, x-cron-secret",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

export function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function userClient(authorization: string) {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function serviceClient() {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireOwnedVendor(client: SupabaseClient) {
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) throw new Error("Authentication required");
  const { data: vendor, error } = await client
    .from("vendors")
    .select("id,business_name,is_verified,management_status")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!vendor?.is_verified || (vendor.management_status && vendor.management_status !== "active")) {
    throw new Error("An approved active Vendor is required");
  }
  return { user, vendor };
}

export function razorpayAuthorization() {
  const keyId = requireEnv("RAZORPAY_TEST_KEY_ID");
  const keySecret = requireEnv("RAZORPAY_TEST_KEY_SECRET");
  if (!keyId.startsWith("rzp_test_")) {
    throw new Error("Only Razorpay Test Mode credentials are allowed");
  }
  return { keyId, keySecret, header: `Basic ${btoa(`${keyId}:${keySecret}`)}` };
}

export async function hmacHex(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function safeProviderPayload(payload: any) {
  const payment = payload?.payload?.payment?.entity;
  const order = payload?.payload?.order?.entity;
  return {
    event: payload?.event ?? null,
    payment: payment ? {
      id: payment.id,
      order_id: payment.order_id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      error_code: payment.error_code,
      error_description: payment.error_description,
    } : null,
    order: order ? { id: order.id, amount: order.amount, currency: order.currency, status: order.status } : null,
  };
}
