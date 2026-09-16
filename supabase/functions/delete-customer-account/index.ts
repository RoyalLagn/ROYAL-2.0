import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { bunnyStorageConfig, presignBunnyObject } from "../_shared/bunnyS3.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
const MAX_OTP_AGE_SECONDS = 10 * 60;

function jwtPayload(token: string): Record<string, unknown> {
  const encoded = token.split(".")[1];
  if (!encoded) return {};
  const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try { return JSON.parse(atob(padded)); } catch { return {}; }
}

function hasRecentEmailOtp(token: string) {
  const payload = jwtPayload(token);
  const now = Math.floor(Date.now() / 1000);
  const authMethods = Array.isArray(payload.amr) ? payload.amr : [];
  return authMethods.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const method = String((entry as Record<string, unknown>).method ?? "").toLowerCase();
    const timestamp = Number((entry as Record<string, unknown>).timestamp ?? 0);
    return method === "otp" && timestamp > 0 && now - timestamp <= MAX_OTP_AGE_SECONDS;
  });
}

async function deleteProfileImage(profileImage: string | null, userId: string) {
  if (!profileImage) return;
  try {
    const parsed = new URL(profileImage);
    const bunny = bunnyStorageConfig();
    if (parsed.hostname === bunny.cdnHostname) {
      const objectKey = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
      if (!objectKey.startsWith(`royallagn/profiles/${userId}/`) || objectKey.includes("..")) return;
      const signed = await presignBunnyObject("DELETE", objectKey, 60);
      const deletion = await fetch(signed.uploadUrl, { method: "DELETE" });
      if (!deletion.ok && deletion.status !== 404) throw new Error("Bunny profile image deletion failed");
      return;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Bunny profile")) throw error;
  }
}

async function deleteReviewImages(urls: string[], userId: string) {
  if (urls.length === 0) return;
  const bunny = bunnyStorageConfig();
  for (const value of urls) {
    let parsed: URL;
    try { parsed = new URL(value); } catch { continue; }
    if (parsed.hostname !== bunny.cdnHostname) continue;
    const objectKey = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    if (!objectKey.startsWith(`royallagn/reviews/${userId}/`) || objectKey.includes("..")) continue;
    const signed = await presignBunnyObject("DELETE", objectKey, 60);
    const deletion = await fetch(signed.uploadUrl, { method: "DELETE" });
    if (!deletion.ok && deletion.status !== 404) throw new Error("Bunny review image deletion failed");
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const requestId = crypto.randomUUID();
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Authentication required." }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userError } = await service.auth.getUser(token);
    const user = userData.user;
    if (userError || !user) return json({ error: "Your session has expired. Please sign in again." }, 401);
    if (!hasRecentEmailOtp(token)) return json({ error: "Verify the fresh email OTP before deleting your account." }, 403);
    if (!(await checkRateLimit(service, `customer-account-delete:${user.id}`, 3, 86400))) {
      return json({ error: "Too many deletion attempts. Please try again tomorrow." }, 429);
    }
    const { data: profile, error: profileError } = await service
      .from("profiles").select("role,profile_image").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "public_user") return json({ error: "Only customer accounts can be deleted here." }, 403);
    const { data: vendor } = await service.from("vendors").select("id").eq("profile_id", user.id).maybeSingle();
    if (vendor) return json({ error: "Vendor accounts require an administrator-reviewed deletion request." }, 403);

    // Read review media through the caller's JWT. Existing reviews RLS limits
    // this query to the authenticated customer's own rows and avoids granting
    // the service role broad access to all marketplace reviews.
    const { data: reviews, error: reviewsError } = await userClient
      .from("reviews")
      .select("image_urls")
      .eq("profile_id", user.id);
    if (reviewsError) throw reviewsError;
    await deleteProfileImage(profile.profile_image, user.id);
    await deleteReviewImages((reviews ?? []).flatMap((row) => row.image_urls ?? []), user.id);
    const { error: prepareError } = await userClient.rpc("prepare_customer_account_deletion");
    if (prepareError) throw prepareError;
    const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;
    return json({ ok: true, reference: `CDEL-${requestId.slice(0, 8).toUpperCase()}` });
  } catch (error) {
    console.error("[delete-customer-account] deletion failed", { requestId, message: error instanceof Error ? error.message : String(error) });
    return json({ error: "Your account could not be deleted completely. Please try again or contact support.", reference: requestId }, 500);
  }
});
