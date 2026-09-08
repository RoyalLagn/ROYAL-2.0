import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: cors });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const service = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: request.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await request.json();
    const enquiryId = body?.enquiryId;
    const actionToken = body?.actionToken;
    const guestId = body?.guestId;
    if (!isUuid(enquiryId) || !isUuid(actionToken)) {
      return json({ error: "Valid enquiry and action tokens are required." }, 400);
    }

    const { data: enquiry, error: enquiryError } = await service
      .from("vendor_enquiries")
      .select("id,vendor_id,customer_id,guest_session_id,action_token,customer_name,reference_code,enquiry_channel,package_name")
      .eq("id", enquiryId)
      .maybeSingle();
    if (enquiryError) throw enquiryError;
    if (!enquiry || enquiry.action_token !== actionToken) {
      return json({ error: "Enquiry not found." }, 404);
    }

    const { data: auth } = await userClient.auth.getUser();
    const ownsAsCustomer = Boolean(auth.user && enquiry.customer_id === auth.user.id);
    const ownsAsGuest = !enquiry.customer_id && isUuid(guestId) && enquiry.guest_session_id === guestId;
    if (!ownsAsCustomer && !ownsAsGuest) return json({ error: "Access denied." }, 403);

    const { data: existing } = await service
      .from("enquiry_push_deliveries")
      .select("status,last_attempt_at,attempt_count")
      .eq("enquiry_id", enquiry.id)
      .maybeSingle();
    // A delivery can be skipped when the vendor has not registered a device yet.
    // Allow that enquiry to be retried after a device token becomes available.
    if (existing?.status === "sent") {
      return json({ ok: true, duplicate: true });
    }
    if (existing?.status === "processing"
      && Date.now() - new Date(existing.last_attempt_at).getTime() < 60_000) {
      return json({ ok: true, duplicate: true });
    }

    if (existing) {
      const { error } = await service.from("enquiry_push_deliveries").update({
        status: "processing",
        attempt_count: Number(existing.attempt_count ?? 1) + 1,
        last_attempt_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error_summary: null,
      }).eq("enquiry_id", enquiry.id);
      if (error) throw error;
    } else {
      const { error } = await service.from("enquiry_push_deliveries").insert({ enquiry_id: enquiry.id });
      if (error?.code === "23505") return json({ ok: true, duplicate: true });
      if (error) throw error;
    }

    const { data: vendor, error: vendorError } = await service
      .from("vendors").select("profile_id,business_name").eq("id", enquiry.vendor_id).maybeSingle();
    if (vendorError) throw vendorError;
    if (!vendor?.profile_id) throw new Error("Vendor notification profile is unavailable.");

    const { data: tokenRows, error: tokenError } = await service
      .from("push_tokens").select("token").eq("profile_id", vendor.profile_id).eq("role", "vendor");
    if (tokenError) throw tokenError;
    const tokens = [...new Set((tokenRows ?? []).map((row) => String(row.token || "").trim()).filter(Boolean))];
    if (!tokens.length) {
      await service.from("enquiry_push_deliveries").update({
        status: "skipped", updated_at: new Date().toISOString(),
      }).eq("enquiry_id", enquiry.id);
      return json({ ok: true, sent: 0, reason: "no_registered_device" });
    }

    const channelLabel = enquiry.enquiry_channel === "call"
      ? "Call Click"
      : enquiry.enquiry_channel === "whatsapp" ? "WhatsApp Click" : "Enquiry";
    const title = `New ${channelLabel}`;
    const detail = enquiry.package_name ? ` about ${enquiry.package_name}` : "";
    const message = `${enquiry.customer_name} sent a ${channelLabel.toLowerCase()}${detail}. ${enquiry.reference_code}`;
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(tokens.map((token) => ({
        to: token,
        title,
        body: message,
        sound: "default",
        priority: "high",
        channelId: "enquiries",
        data: { type: "enquiry", enquiryId: enquiry.id, targetPath: "/VendorEnquiries" },
      }))),
    });
    const payload = await response.json().catch(() => null);
    const tickets = Array.isArray(payload?.data) ? payload.data : [];
    const sent = response.ok ? tickets.filter((ticket: { status?: string }) => ticket.status === "ok").length : 0;
    const failed = tokens.length - sent;
    const errors = tickets
      .filter((ticket: { status?: string }) => ticket.status !== "ok")
      .map((ticket: { message?: string }) => String(ticket.message || "Expo rejected notification"))
      .slice(0, 3);
    if (!response.ok) errors.unshift(`Expo API ${response.status}`);

    // Expo permanently rejects tokens after an app is uninstalled or its
    // notification identity changes. Removing only those exact token rows
    // prevents repeated delivery attempts without affecting the vendor's
    // other logged-in devices.
    const invalidTokens = tickets.flatMap((ticket: { status?: string; details?: { error?: string } }, index: number) =>
      ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered" && tokens[index]
        ? [tokens[index]]
        : []
    );
    if (invalidTokens.length) {
      const { error: cleanupError } = await service
        .from("push_tokens")
        .delete()
        .eq("profile_id", vendor.profile_id)
        .in("token", invalidTokens);
      if (cleanupError) {
        console.error("[send-enquiry-push] invalid token cleanup failed", cleanupError.message);
      }
    }

    await service.from("enquiry_push_deliveries").update({
      status: sent > 0 ? "sent" : "failed",
      sent_count: sent,
      failed_count: failed,
      error_summary: errors.join("; ") || null,
      updated_at: new Date().toISOString(),
    }).eq("enquiry_id", enquiry.id);

    return json({ ok: sent > 0, sent, failed });
  } catch (error) {
    console.error("[send-enquiry-push]", error instanceof Error ? error.message : error);
    return json({ error: "Unable to deliver enquiry notification." }, 500);
  }
});
