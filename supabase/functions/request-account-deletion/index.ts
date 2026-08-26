import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimit.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const text = (value: unknown) => String(value ?? "").trim();

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });

  try {
    const body = await request.json().catch(() => ({}));
    const accountType = text(body.account_type).toLowerCase();
    const email = text(body.email).toLowerCase();
    const fullName = text(body.full_name).slice(0, 160) || null;
    const phone = text(body.phone).slice(0, 30) || null;
    const reason = text(body.reason).slice(0, 1000) || null;

    if (!['customer', 'vendor'].includes(accountType)) throw new Error("Choose Customer account or Vendor profile.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter the email address associated with the account.");

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    if (!(await checkRateLimit(service, `account-deletion:${email}`, 3, 86400))) {
      return Response.json({ error: "Too many requests for this email. Please try again tomorrow." }, { status: 429, headers: cors });
    }

    let requesterUserId: string | null = null;
    const token = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (token) {
      const { data } = await service.auth.getUser(token);
      requesterUserId = data.user?.id ?? null;
    }

    const { data: existing, error: existingError } = await service
      .from("account_deletion_requests")
      .select("request_reference")
      .eq("account_type", accountType)
      .eq("email", email)
      .in("status", ["pending", "verified", "processing"])
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return Response.json({ reference: existing.request_reference, already_requested: true }, { headers: cors });

    const reference = `DEL-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const { error } = await service.from("account_deletion_requests").insert({
      request_reference: reference,
      account_type: accountType,
      email,
      full_name: fullName,
      phone,
      reason,
      requester_user_id: requesterUserId,
    });
    if (error) throw error;
    return Response.json({ reference }, { status: 201, headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit the deletion request.";
    return Response.json({ error: message }, { status: 400, headers: cors });
  }
});
