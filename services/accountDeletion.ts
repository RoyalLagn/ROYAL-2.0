import { supabase } from "@/services/supabase";

export type AccountDeletionType = "customer" | "vendor";

export type AccountDeletionRequest = {
  accountType: AccountDeletionType;
  email: string;
  fullName: string;
  phone: string;
  reason: string;
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
