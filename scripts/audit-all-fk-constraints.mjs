import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env" });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log("=== FOREIGN KEY AUDIT: REFERENCING auth.users and public.profiles ===");

  const { data, error } = await supabaseAdmin.rpc("get_foreign_keys_for_audit");
  if (error) {
    console.error("Error fetching FK constraints:", error);
    return;
  }

  console.log(`Found ${data.length} foreign key relationships:`);
  console.table(data);
}

main().catch(console.error);
