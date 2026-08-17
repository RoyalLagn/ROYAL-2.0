import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Mirrors the auth-validation pattern already used in
// supabase/functions/send-admin-push/index.ts (this project keeps each admin
// Edge Function self-contained rather than sharing a module).

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
  if (token.startsWith("sb_publishable_") || token.startsWith("sb_secret_") || token.startsWith("sbp_")) {
    return true;
  }
  const claims = decodeJwtPayload(token);
  return claims?.role === "anon" || claims?.role === "service_role";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { status: 200, headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed. Use POST." }, 405);

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const { token, reason: tokenReason } = extractBearerToken(request.headers.get("Authorization"));
    if (!token) {
      console.error("[admin-logout-all-devices] auth failed:", tokenReason);
      return json({ error: tokenReason ?? "Authentication required." }, 401);
    }
    if (isApiKeyToken(token)) {
      const message = "User access token required. Do not send the anon/publishable/service key as Bearer.";
      console.error("[admin-logout-all-devices] auth failed:", message);
      return json({ error: message }, 401);
    }

    // service_role lives only in this server-side Edge Function environment
    // (Deno.env) and is never returned to, or usable by, the client.
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Validate the token is a real, current Supabase session (not forged,
    // not expired) before trusting anything decoded from it.
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      const message = authError?.message
        ? `Invalid or expired session: ${authError.message}`
        : "Invalid or expired session. Sign in again as an administrator.";
      console.error("[admin-logout-all-devices] auth failed:", message);
      return json({ error: message }, 401);
    }
    const userId = authData.user.id;

    // Same role/is_active gate as every other admin-only Edge Function in
    // this project (mirrors private.is_admin() used in RLS policies).
    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("id,role,is_active")
      .eq("id", userId)
      .maybeSingle();
    if (profileError) {
      console.error("[admin-logout-all-devices] profile lookup failed:", profileError.message, { userId });
      return json({ error: "Unable to verify administrator profile." }, 403);
    }
    if (!profile) {
      console.error("[admin-logout-all-devices] no profile row", { userId });
      return json({ error: "Administrator profile not found." }, 403);
    }
    const role = String(profile.role ?? "");
    if (!profile.is_active) {
      console.error("[admin-logout-all-devices] account disabled", { userId, role });
      return json({ error: "Administrator account has been disabled." }, 403);
    }
    if (!ADMIN_ROLES.has(role)) {
      console.error("[admin-logout-all-devices] not an admin role", { userId, role });
      return json({ error: "Admin access required." }, 403);
    }

    // Require the same aal2 (MFA-verified) assurance level the rest of the
    // admin workspace requires — private.is_admin() checks the identical
    // auth.jwt()->>'aal' claim server-side in RLS. This action is at least
    // as sensitive as any RLS-gated write, so it must not be reachable with
    // only a password-verified (aal1) session, regardless of any client-side
    // dev bypass flag (which this server-side check never honors).
    const claims = decodeJwtPayload(token);
    if (claims?.aal !== "aal2") {
      console.error("[admin-logout-all-devices] aal2 required", { userId, aal: claims?.aal ?? "unknown" });
      return json({ error: "Multi-factor verification required before revoking sessions." }, 403);
    }

    // The actual server-side revocation: scope "global" invalidates every
    // refresh token issued to this user (this device and every other),
    // including the one just used to authenticate this request. This is a
    // real GoTrue-side revocation, not a client-side flag — it requires the
    // service_role key, which never leaves this function.
    const { error: signOutError } = await service.auth.admin.signOut(token, "global");
    if (signOutError) {
      console.error("[admin-logout-all-devices] revocation failed:", signOutError.message, { userId });
      return json({ error: signOutError.message || "Unable to revoke sessions. Try again." }, 500);
    }

    return json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to sign out of all devices.";
    console.error("[admin-logout-all-devices] error:", message);
    return json({ error: message }, 400);
  }
});
