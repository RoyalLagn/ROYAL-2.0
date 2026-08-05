import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-authorization",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin",
};

const ADMIN_ROLES = new Set(["admin", "super_admin"]);

type Audience = "customers" | "vendors" | "everyone" | "vendor";

type RequestBody = {
  title?: string;
  message?: string;
  imageUrl?: string | null;
  audience?: Audience;
  targetVendorId?: string | null;
  targetPath?: string | null;
};

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: "default";
  priority: "high";
  channelId?: string;
  richContent?: { image?: string };
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured on the Edge Function.`);
  return value;
}

function extractBearerToken(authHeader: string | null): {
  token: string | null;
  reason: string | null;
} {
  if (!authHeader?.trim()) {
    return { token: null, reason: "Missing Authorization header." };
  }
  const match = authHeader.trim().match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    return {
      token: null,
      reason: "Authorization header must be 'Bearer <access_token>'.",
    };
  }
  const token = match[1].trim();
  if (!token) {
    return { token: null, reason: "Authorization Bearer token is empty." };
  }
  return { token, reason: null };
}

function decodeJwtRole(token: string): string | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = JSON.parse(atob(padded)) as { role?: string; sub?: string };
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

function isApiKeyToken(token: string) {
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (token === anon || token === service) return true;
  if (
    token.startsWith("sb_publishable_") ||
    token.startsWith("sb_secret_") ||
    token.startsWith("sbp_")
  ) {
    return true;
  }
  const role = decodeJwtRole(token);
  return role === "anon" || role === "service_role";
}

async function sendExpoPush(messages: ExpoMessage[]) {
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let index = 0; index < messages.length; index += 100) {
    const chunk = messages.slice(index, index + 100);
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chunk),
    });

    if (!response.ok) {
      failed += chunk.length;
      errors.push(`Expo API ${response.status}`);
      continue;
    }

    const payload = await response.json();
    const tickets = Array.isArray(payload?.data) ? payload.data : [];
    for (const ticket of tickets) {
      if (ticket?.status === "ok") sent += 1;
      else {
        failed += 1;
        if (ticket?.message) errors.push(String(ticket.message));
      }
    }
    if (!tickets.length) {
      sent += chunk.length;
    }
  }

  return { sent, failed, errors };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: cors });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  try {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const { token, reason: tokenReason } = extractBearerToken(
      request.headers.get("Authorization"),
    );
    if (!token) {
      console.error("[send-admin-push] auth failed:", tokenReason);
      return json({ error: tokenReason ?? "Authentication required." }, 401);
    }
    if (isApiKeyToken(token)) {
      const message =
        "User access token required. Do not send the anon/publishable/service key as Bearer.";
      console.error("[send-admin-push] auth failed:", message);
      return json({ error: message }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData.user) {
      const message = authError?.message
        ? `Invalid or expired session: ${authError.message}`
        : "Invalid or expired session. Sign in again as an administrator.";
      console.error("[send-admin-push] auth failed:", message);
      return json({ error: message }, 401);
    }

    const userId = authData.user.id;
    const { data: profile, error: profileError } = await service
      .from("profiles")
      .select("id,role,is_active,email")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      const message = `Admin profile lookup failed: ${profileError.message}`;
      console.error("[send-admin-push] auth failed:", message, { userId });
      return json({ error: message }, 403);
    }
    if (!profile) {
      const message =
        `No profile row found for auth user ${userId}. Admin accounts must exist in public.profiles.`;
      console.error("[send-admin-push] auth failed:", message);
      return json({ error: message }, 403);
    }

    const role = String(profile.role ?? "");
    if (!profile.is_active) {
      const message = `Administrator account is disabled (role=${role}).`;
      console.error("[send-admin-push] auth failed:", message, { userId });
      return json({ error: message }, 403);
    }
    if (!ADMIN_ROLES.has(role)) {
      const message =
        `Admin access required. Profile role is '${role || "missing"}' (expected admin or super_admin).`;
      console.error("[send-admin-push] auth failed:", message, {
        userId,
        email: profile.email,
      });
      return json({ error: message }, 403);
    }

    const body = (await request.json()) as RequestBody;
    const title = String(body.title ?? "").trim();
    const message = String(body.message ?? "").trim();
    const imageUrl = body.imageUrl ? String(body.imageUrl).trim() : null;
    const audience = body.audience as Audience;
    const targetVendorId = body.targetVendorId ? String(body.targetVendorId) : null;
    const targetPath = body.targetPath ? String(body.targetPath).trim() : null;

    if (!title || !message) return json({ error: "Title and message are required." }, 400);
    if (!["customers", "vendors", "everyone", "vendor"].includes(audience)) {
      return json({ error: "Invalid audience." }, 400);
    }
    if (audience === "vendor" && !targetVendorId) {
      return json({ error: "Select a vendor before sending." }, 400);
    }

    const { data: campaign, error: campaignError } = await service
      .from("push_campaigns")
      .insert({
        title,
        message,
        image_url: imageUrl,
        audience,
        target_vendor_id: targetVendorId,
        target_path: targetPath,
        status: "sending",
        created_by: userId,
      })
      .select("*")
      .single();
    if (campaignError || !campaign) {
      return json({
        error: campaignError?.message || "Unable to create campaign.",
      }, 400);
    }

    let customerIds: string[] = [];
    let vendorRows: { id: string; profile_id: string }[] = [];

    if (audience === "customers" || audience === "everyone") {
      const { data, error } = await service
        .from("profiles")
        .select("id")
        .eq("role", "public_user")
        .eq("is_active", true);
      if (error) throw error;
      customerIds = (data ?? []).map((row) => row.id);
    }

    if (audience === "vendors" || audience === "everyone") {
      const { data, error } = await service
        .from("vendors")
        .select("id,profile_id");
      if (error) throw error;
      vendorRows = (data ?? []) as { id: string; profile_id: string }[];
    }

    if (audience === "vendor" && targetVendorId) {
      const { data, error } = await service
        .from("vendors")
        .select("id,profile_id")
        .eq("id", targetVendorId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Vendor not found." }, 404);
      vendorRows = [data as { id: string; profile_id: string }];
    }

    let inboxCount = 0;
    const metadata = {
      campaign_id: campaign.id,
      image_url: imageUrl,
      audience,
    };

    if (customerIds.length) {
      const rows = customerIds.map((customerId) => ({
        customer_id: customerId,
        type: "admin_announcement",
        title,
        message,
        target_path: targetPath,
        metadata,
      }));
      for (let index = 0; index < rows.length; index += 500) {
        const chunk = rows.slice(index, index + 500);
        const { error } = await service.from("customer_notifications").insert(chunk);
        if (error) throw error;
        inboxCount += chunk.length;
      }
    }

    if (vendorRows.length) {
      const rows = vendorRows.map((vendor) => ({
        vendor_id: vendor.id,
        title,
        body: message,
        kind: "admin",
        target_path: targetPath,
        is_read: false,
      }));
      for (let index = 0; index < rows.length; index += 500) {
        const chunk = rows.slice(index, index + 500);
        const { error } = await service.from("vendor_notifications").insert(chunk);
        if (error) throw error;
        inboxCount += chunk.length;
      }
    }

    const profileIds = new Set<string>([
      ...customerIds,
      ...vendorRows.map((row) => row.profile_id).filter(Boolean),
    ]);

    let tokens: { token: string; platform: string }[] = [];
    if (profileIds.size) {
      const ids = [...profileIds];
      for (let index = 0; index < ids.length; index += 200) {
        const chunk = ids.slice(index, index + 200);
        const { data, error } = await service
          .from("push_tokens")
          .select("token,platform")
          .in("profile_id", chunk);
        if (error) throw error;
        tokens = tokens.concat((data ?? []) as { token: string; platform: string }[]);
      }
    }

    const uniqueTokens = [...new Set(tokens.map((row) => row.token).filter(Boolean))];
    const messages: ExpoMessage[] = uniqueTokens.map((tokenValue) => ({
      to: tokenValue,
      title,
      body: message,
      sound: "default",
      priority: "high",
      channelId: "default",
      data: {
        campaignId: campaign.id,
        targetPath: targetPath ?? "",
        imageUrl: imageUrl ?? "",
        type: "admin_announcement",
      },
      ...(imageUrl ? { richContent: { image: imageUrl } } : {}),
    }));

    const delivery = messages.length
      ? await sendExpoPush(messages)
      : { sent: 0, failed: 0, errors: [] as string[] };

    const status =
      delivery.failed > 0 && delivery.sent > 0
        ? "partial"
        : delivery.failed > 0 && delivery.sent === 0 && messages.length > 0
          ? "failed"
          : "sent";

    const { data: updated, error: updateError } = await service
      .from("push_campaigns")
      .update({
        status,
        inbox_count: inboxCount,
        sent_count: delivery.sent,
        failed_count: delivery.failed,
        error_summary: delivery.errors.slice(0, 5).join("; ") || null,
      })
      .eq("id", campaign.id)
      .select("*")
      .single();
    if (updateError) throw updateError;

    return json({
      campaign: updated,
      inboxCount,
      sentCount: delivery.sent,
      failedCount: delivery.failed,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to send push notification.";
    console.error("[send-admin-push] error:", message);
    return json({ error: message }, 400);
  }
});
