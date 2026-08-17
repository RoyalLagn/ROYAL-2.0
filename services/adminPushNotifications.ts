import { supabase } from "@/services/supabase";
import { verifyAdminSession } from "@/services/adminAuth";
import { AdminVendorService } from "@/services/adminVendorService";
import type { AdminVendorRecord, VendorFilters } from "@/types/adminVendors";
import type {
  PushCampaign,
  PushCampaignInput,
  PushSendResult,
} from "@/types/pushNotifications";

const DEFAULT_VENDOR_FILTERS: VendorFilters = {
  query: "",
  status: "all",
  verification: "all",
  plan: "all",
  categoryId: null,
  city: null,
  state: null,
  sort: "newest",
  page: 1,
  pageSize: 20,
};

async function readFunctionError(error: unknown): Promise<string | null> {
  const context =
    typeof error === "object" && error && "context" in error
      ? (error as { context?: Response }).context
      : null;
  if (!context) return null;

  try {
    const payload = await context.clone().json();
    if (typeof payload?.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }
    if (typeof payload?.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }
  } catch {
    // Fall through to text body.
  }

  try {
    const text = (await context.clone().text()).trim();
    if (text) return text.slice(0, 300);
  } catch {
    // Ignore body parse failures.
  }
  return null;
}

async function requireAdminAccessToken() {
  const identity = await verifyAdminSession(undefined, false);
  let accessToken = identity.session.access_token;

  const expiresAt = identity.session.expires_at ?? 0;
  const refreshSoon = expiresAt * 1000 <= Date.now() + 60_000;
  if (refreshSoon) {
    const { data, error } = await supabase.auth.refreshSession();
    if (error || !data.session?.access_token) {
      throw new Error(
        error?.message ||
          "Administrator session expired. Sign in again before sending notifications.",
      );
    }
    await verifyAdminSession(data.session, false);
    accessToken = data.session.access_token;
  }

  if (!accessToken) {
    throw new Error("Administrator access token missing. Sign in again.");
  }

  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (
    accessToken === anonKey ||
    accessToken.startsWith("sb_publishable_") ||
    accessToken.startsWith("sb_secret_")
  ) {
    throw new Error(
      "Invalid session token. Expected a user access token, not the anon/publishable key.",
    );
  }

  return accessToken;
}

export const AdminPushNotificationService = {
  async listCampaigns(force = false): Promise<PushCampaign[]> {
    void force;
    const { data, error } = await supabase
      .from("push_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const campaigns = (data ?? []) as PushCampaign[];
    if (!campaigns.length) {
      // push_campaigns_admin_select (private.is_admin()) is one of the few
      // admin tables with no public-read fallback, so an empty result here
      // is genuinely ambiguous: it can mean "no campaigns yet" or "this
      // session lacks aal2 and RLS silently filtered every row" — a plain
      // SELECT can't tell those apart. Checking the real, unwrapped MFA
      // level (not the app's own verifyAdminSession(), which honors the
      // local dev bypass flag and would hide this) turns that ambiguity
      // into an accurate message instead of a false "No campaigns yet".
      const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance && assurance.currentLevel !== "aal2") {
        throw new Error("Send History requires a fully MFA-verified (aal2) administrator session to read. Complete Authenticator verification, then refresh this page.");
      }
    }
    return campaigns;
  },

  async searchVendors(options: {
    query?: string;
    categoryId?: string | null;
    pageSize?: number;
  } = {}): Promise<AdminVendorRecord[]> {
    const result = await AdminVendorService.list({
      ...DEFAULT_VENDOR_FILTERS,
      query: (options.query ?? "").trim(),
      categoryId: options.categoryId ?? null,
      pageSize: options.pageSize ?? 50,
      sort: "business_az",
    }, true);
    return result.rows.filter((row) => Boolean(row.vendor_id));
  },

  async send(input: PushCampaignInput): Promise<PushSendResult> {
    const title = input.title.trim();
    const message = input.message.trim();
    if (!title) throw new Error("Title is required.");
    if (!message) throw new Error("Message is required.");
    if (input.audience === "vendor" && !input.targetVendorId) {
      throw new Error("Select a vendor before sending.");
    }

    const accessToken = await requireAdminAccessToken();

    const { data, error } = await supabase.functions.invoke<PushSendResult>(
      "send-admin-push",
      {
        body: {
          title,
          message,
          imageUrl: null,
          audience: input.audience,
          targetVendorId: input.targetVendorId || null,
          targetPath: input.targetPath?.trim() || null,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (error) {
      const detailed = await readFunctionError(error);
      throw new Error(detailed || error.message || "Unable to send push notification.");
    }
    if (!data?.campaign) throw new Error("Push notification send failed.");
    return data;
  },

  subscribe(onChange: () => void) {
    const channel = supabase
      .channel(`admin-push-campaigns-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "push_campaigns" },
        onChange,
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
      void supabase.removeChannel(channel);
    };
  },
};
