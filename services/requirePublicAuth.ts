import { supabase } from "@/services/supabase";

export class PublicAuthenticationRequiredError extends Error {
  constructor(message = "Please log in or create an account to continue.") {
    super(message);
    this.name = "PublicAuthenticationRequiredError";
  }
}

export async function requirePublicUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new PublicAuthenticationRequiredError();
  return user;
}
