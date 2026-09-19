import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase";

async function functionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      if (payload?.error) {
        const reference = payload.reference ? ` Support reference: ${String(payload.reference)}.` : "";
        return `${String(payload.error)}${reference}`;
      }
    } catch { /* Response body was not JSON. */ }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

export type AccountDeletionType = "customer" | "vendor";

export type AccountDeletionRequest = {
  accountType: AccountDeletionType;
  email: string;
  fullName: string;
  phone: string;
  reason: string;
};

export type VendorDeletionStatus = {
  reference: string;
  status: "pending" | "verified" | "processing" | "rejected";
  requestedAt: string;
  decisionReason: string | null;
};

export async function requestAccountDeletion(input: AccountDeletionRequest): Promise<string> {
  const { data, error } = await supabase.functions.invoke("request-account-deletion", {
    body: {
      account_type: input.accountType,
      email: input.email,
      full_name: input.fullName,
      phone: input.phone,
      reason: input.reason,
    },
  });
  if (error) throw new Error(error.message || "Unable to submit the deletion request.");
  if (data?.error) throw new Error(String(data.error));
  if (!data?.reference) throw new Error("The deletion request did not return a reference number.");
  return String(data.reference);
}

export async function sendCustomerDeletionOtp(expectedUserId: string): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user?.email || user.id !== expectedUserId) {
    throw userError ?? new Error("Your customer session has expired. Please sign in again.");
  }
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (profile?.role !== "public_user") throw new Error("Only customer accounts can be deleted here.");
  const email = user.email.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
  return email;
}

export async function verifyCustomerDeletionOtp(expectedUserId: string, email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: "email",
  });
  if (error) throw error;
  if (!data.session || !data.user || data.user.id !== expectedUserId) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    throw new Error("The verified email does not belong to this customer account.");
  }
}

export async function deleteVerifiedCustomerAccount(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("delete-customer-account");
  if (error) throw new Error(await functionErrorMessage(error, "Unable to delete your account."));
  if (data?.error) throw new Error(String(data.error));
  if (!data?.reference) throw new Error("Account deletion did not return a confirmation reference.");
  return String(data.reference);
}

export async function sendVendorDeletionOtp(expectedUserId: string): Promise<string> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user?.email || user.id !== expectedUserId) {
    throw userError ?? new Error("Your vendor session has expired. Please sign in again.");
  }
  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (vendorError) throw vendorError;
  if (!vendor) throw new Error("No vendor workspace is connected to this account.");
  const email = user.email.trim().toLowerCase();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
  return email;
}

export async function verifyVendorDeletionOtp(expectedUserId: string, email: string, token: string) {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: "email",
  });
  if (error) throw error;
  if (!data.session || !data.user || data.user.id !== expectedUserId) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    throw new Error("The verified email does not belong to this vendor account.");
  }
}

export async function submitVerifiedVendorDeletion(reason: string): Promise<string> {
  const { data, error } = await supabase.functions.invoke("request-vendor-deletion", {
    body: { reason },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Unable to submit the vendor deletion request."));
  if (data?.error) throw new Error(String(data.error));
  if (!data?.reference) throw new Error("The request did not return a confirmation reference.");
  return String(data.reference);
}

export async function getVendorDeletionStatus(): Promise<VendorDeletionStatus | null> {
  const { data, error } = await supabase.functions.invoke("request-vendor-deletion", {
    body: { action: "status" },
  });
  if (error) throw new Error(await functionErrorMessage(error, "Unable to check your deletion request status."));
  if (data?.error) throw new Error(String(data.error));
  if (!data?.request) return null;
  return {
    reference: String(data.request.request_reference),
    status: data.request.status,
    requestedAt: String(data.request.requested_at),
    decisionReason: data.request.decision_reason ? String(data.request.decision_reason) : null,
  };
}
