import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deleteClipCloudinaryAssets } from "../_shared/cloudinaryMedia.ts";

// Mirrors the auth-validation pattern already used by send-admin-push and
// admin-logout-all-devices (this project keeps each admin Edge Function
// self-contained rather than sharing an auth module).

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured on the Edge Function.`);
  return value;
}

function extractBearerToken(authHeader: string | null): { token: string | null; reason: string | null } {
  if (!authHeader?.trim()) return { token: null, reason: "Missing Authorization header." };
  const match = authHeader.trim().match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) return { token: null, reason: "Authorization header must be 'Bearer <access_token>'." };
  const token = match[1].trim();
  if (!token) return { token: null, reason: "Authorization Bearer token is empty." };
  return { token, reason: null };
}

function decodeJwtPayload(token: string): { role?: string; aal?: string; sub?: string } | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isApiKeyToken(token: string) {
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (token === anon || token === service) return true;
  if (token.startsWith("sb_publishable_") || token.startsWith("sb_secret_") || token.startsWith("sbp_")) return true;
  const claims = decodeJwtPayload(token);
  return claims?.role === "anon" || claims?.role === "service_role";
}

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: "default";
  priority: "high";
};

async function sendBestEffortPush(tokens: string[], title: string, body: string, targetPath: string) {
  if (!tokens.length) return;
  const messages: ExpoMessage[] = tokens.map((to) => ({
    to, title, body, sound: "default", priority: "high", data: { type: "clip_removed", targetPath },
  }));
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
  } catch (error) {
    // Best-effort only — the authoritative notification is the
    // vendor_notifications row inserted before this point, which has
    // already succeeded by the time this runs.
    console.error("[admin-delete-clip] best-effort push failed", { error: error instanceof Error ? error.message : error });
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed. Use POST." }, 405);
  const requestId = crypto.randomUUID();

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const { token, reason: tokenReason } = extractBearerToken(request.headers.get("Authorization"));
    if (!token) {
      console.error("[admin-delete-clip] auth failed:", tokenReason);
      return json({ error: tokenReason ?? "Authentication required.", stage: "auth" }, 401);
    }
    if (isApiKeyToken(token)) {
      const message = "User access token required. Do not send the anon/publishable/service key as Bearer.";
      console.error("[admin-delete-clip] auth failed:", message);
      return json({ error: message, stage: "auth" }, 401);
    }

    // service_role is used ONLY for the read-only push_tokens lookup below
    // (matching send-admin-push's exact pattern) — every read/write to
    // clips/vendor_notifications/the deletion RPC goes through userClient,
    // scoped to the admin's own JWT, so RLS (private.is_admin()) and the
    // RPC's own aal2/role checks independently re-verify authorization —
    // this function never uses service_role to bypass either.
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      const message = authError?.message ? `Invalid or expired session: ${authError.message}` : "Invalid or expired session. Sign in again as an administrator.";
      console.error("[admin-delete-clip] auth failed:", message);
      return json({ error: message, stage: "auth" }, 401);
    }
    const userId = authData.user.id;

    const { data: profile, error: profileError } = await service.from("profiles").select("id,role,is_active").eq("id", userId).maybeSingle();
    if (profileError) {
      console.error("[admin-delete-clip] profile lookup failed:", profileError.message, { userId });
      return json({ error: "Unable to verify administrator profile.", stage: "auth" }, 403);
    }
    if (!profile) return json({ error: "Administrator profile not found.", stage: "auth" }, 403);
    const role = String(profile.role ?? "");
    if (!profile.is_active) return json({ error: "Administrator account has been disabled.", stage: "auth" }, 403);
    if (!ADMIN_ROLES.has(role)) return json({ error: "Admin access required.", stage: "auth" }, 403);

    // Same aal2 requirement every admin RLS policy enforces via
    // private.is_admin() — this action is at least as sensitive as any
    // RLS-gated write, and this check never honors the client-only dev MFA
    // bypass flag.
    const claims = decodeJwtPayload(token);
    if (claims?.aal !== "aal2") {
      return json({ error: "Multi-factor verification required before deleting a clip.", stage: "auth" }, 403);
    }

    const body = await request.json();
    const clipId = String(body.clipId ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    if (!clipId) return json({ error: "clipId is required.", stage: "validation" }, 400);
    if (!reason) return json({ error: "A deletion reason is required.", stage: "validation" }, 400);

    // Resolve the clip and its owner server-side — the vendor to notify and
    // the media to delete are always derived from the clip record itself,
    // never accepted from the client.
    const { data: clip, error: clipError } = await userClient
      .from("clips")
      .select("id,title,vendor_id,cloudinary_public_id,vendors(business_name,profile_id),categories(name)")
      .eq("id", clipId)
      .maybeSingle();
    if (clipError || !clip) {
      console.error("[admin-delete-clip] clip lookup failed", { requestId, clipId, error: clipError?.message });
      return json({ error: clipError?.message || "Clip not found.", stage: "lookup" }, 404);
    }
    const vendor = Array.isArray(clip.vendors) ? clip.vendors[0] : clip.vendors;
    const category = Array.isArray(clip.categories) ? clip.categories[0] : clip.categories;
    const vendorId = clip.vendor_id as string;
    const vendorProfileId = vendor?.profile_id as string | undefined;

    // Step 1 — notify the vendor BEFORE any deletion. If this fails, stop
    // here: nothing has been touched, the admin can retry.
    const notificationBody = `Your clip "${clip.title}" has been removed by RoyalLagn Admin.\n\nReason:\n${reason}`;
    const { error: notifyError } = await userClient.from("vendor_notifications").insert({
      vendor_id: vendorId,
      title: "Clip removed by RoyalLagn Admin",
      body: notificationBody,
      kind: "clip_removed",
      target_path: "/VendorClips",
    });
    if (notifyError) {
      console.error("[admin-delete-clip] vendor notification failed", { requestId, clipId, vendorId, error: notifyError.message });
      return json({ error: notifyError.message, stage: "notification" }, 400);
    }

    // Best-effort push, in addition to the in-app notification above (which
    // already succeeded and is the authoritative delivery).
    if (vendorProfileId) {
      const { data: tokens } = await service.from("push_tokens").select("token").eq("profile_id", vendorProfileId);
      const tokenList = (tokens ?? []).map((row) => row.token).filter(Boolean);
      await sendBestEffortPush(tokenList, "Clip removed by RoyalLagn Admin", `Your clip "${clip.title}" was removed. Tap to see the reason.`, "/VendorClips");
    }

    // Step 2 — delete the real media. If this fails, the clip row is left
    // fully intact (the vendor has been notified but nothing was actually
    // removed yet) — Cloudinary destroy is idempotent, so retrying the whole
    // action is safe.
    if (clip.cloudinary_public_id) {
      try {
        await deleteClipCloudinaryAssets(clip.cloudinary_public_id as string, { requestId, clipId, vendorId });
      } catch (mediaError) {
        const message = mediaError instanceof Error ? mediaError.message : "Unable to delete the clip's media.";
        console.error("[admin-delete-clip] media deletion failed", { requestId, clipId, vendorId, error: message });
        return json({ error: message, stage: "media" }, 400);
      }
    }

    // Step 3 — the actual permanent deletion (+ audit log row), via the
    // admin's own JWT-scoped client so private.is_admin() and auth.uid()
    // inside the RPC independently re-verify this exact same authorization.
    const { error: deleteError } = await userClient.rpc("admin_hard_delete_clip", { target_clip_id: clipId, deletion_reason: reason });
    if (deleteError) {
      console.error("[admin-delete-clip] database deletion failed after media cleanup", { requestId, clipId, vendorId, error: deleteError.message });
      return json({
        error: `The clip's media was removed, but the clip record could not be deleted: ${deleteError.message}. The clip may still be present — do not assume it was deleted.`,
        stage: "database",
      }, 500);
    }

    console.log("[admin-delete-clip] complete", { requestId, clipId, vendorId, category: category?.name ?? null });
    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to delete this clip.";
    console.error("[admin-delete-clip] error:", { requestId, message });
    return json({ error: message, stage: "unknown" }, 400);
  }
});
