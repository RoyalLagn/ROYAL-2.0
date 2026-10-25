import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { destroyCloudinaryAsset, extractCloudinaryPublicId } from "../_shared/cloudinaryAdmin.ts";

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
    const publicId = extractCloudinaryPublicId(profileImage);
    if (publicId && publicId.startsWith(`royallagn/profiles/${userId}/`)) {
      await destroyCloudinaryAsset(publicId);
    }
  } catch (error) {
    console.error("[delete-customer-account] media cleanup skipped", {
      kind: "profile",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function deleteReviewImages(urls: string[], userId: string) {
  if (urls.length === 0) return;
  for (const value of urls) {
    try {
      const publicId = extractCloudinaryPublicId(value);
      if (publicId && publicId.startsWith(`royallagn/reviews/${userId}/`)) {
        await destroyCloudinaryAsset(publicId);
      }
    } catch (error) {
      console.error("[delete-customer-account] media cleanup skipped", {
        kind: "review",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

type OwnedStorageObject = {
  storage_bucket_id: string;
  storage_object_name: string;
};

async function deleteOwnedSupabaseStorageObjects(
  service: ReturnType<typeof createClient>,
  objects: OwnedStorageObject[],
) {
  const objectsByBucket = new Map<string, string[]>();
  for (const object of objects) {
    const names = objectsByBucket.get(object.storage_bucket_id) ?? [];
    names.push(object.storage_object_name);
    objectsByBucket.set(object.storage_bucket_id, names);
  }

  for (const [bucketId, names] of objectsByBucket) {
    for (let offset = 0; offset < names.length; offset += 1000) {
      const { error } = await service.storage.from(bucketId).remove(names.slice(offset, offset + 1000));
      if (error) throw error;
    }
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const requestId = crypto.randomUUID();
  let stage = "authenticate";
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
    stage = "validate_account";
    const { data: profile, error: profileError } = await service
      .from("profiles").select("role,profile_image").eq("id", user.id).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== "public_user") return json({ error: "Only customer accounts can be deleted here." }, 403);
    const { data: vendor } = await service.from("vendors").select("id").eq("profile_id", user.id).maybeSingle();
    if (vendor) return json({ error: "Vendor accounts require an administrator-reviewed deletion request." }, 403);

    stage = "read_review_media";
    const { data: reviews, error: reviewsError } = await userClient
      .from("reviews")
      .select("image_urls")
      .eq("profile_id", user.id);
    if (reviewsError) throw reviewsError;

    stage = "delete_media";
    await deleteProfileImage(profile.profile_image, user.id);
    await deleteReviewImages((reviews ?? []).flatMap((row) => row.image_urls ?? []), user.id);

    stage = "list_supabase_storage";
    const { data: ownedStorageObjects, error: ownedStorageError } = await userClient
      .rpc("list_own_storage_objects_for_account_deletion");
    if (ownedStorageError) throw ownedStorageError;

    stage = "delete_supabase_storage";
    await deleteOwnedSupabaseStorageObjects(
      service,
      (ownedStorageObjects ?? []) as OwnedStorageObject[],
    );

    stage = "anonymize_customer_data";
    const { error: prepareError } = await userClient.rpc("prepare_customer_account_deletion");
    if (prepareError) throw prepareError;
    stage = "delete_auth_user";
    const { error: deleteError } = await service.auth.admin.deleteUser(user.id, false);
    if (deleteError) throw deleteError;
    return json({ ok: true, reference: `CDEL-${requestId.slice(0, 8).toUpperCase()}` });
  } catch (error) {
    console.error("[delete-customer-account] deletion failed", { requestId, stage, message: error instanceof Error ? error.message : String(error) });
    const errorByStage: Record<string, string> = {
      authenticate: "Your session could not be verified. Please sign in and verify a fresh OTP.",
      validate_account: "Your customer account could not be validated for deletion.",
      list_supabase_storage: "Your uploaded files could not be checked for deletion.",
      delete_supabase_storage: "Your uploaded files could not be deleted.",
      anonymize_customer_data: "Your retained customer records could not be anonymized.",
      delete_auth_user: "Your login account could not be deleted.",
    };
    return json({
      error: errorByStage[stage] ?? "Your account could not be deleted completely. Please try again or contact support.",
      reference: requestId,
    }, 500);
  }
});
