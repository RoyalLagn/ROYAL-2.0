import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

export async function loadSeoVendors() {
  try {
    loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const required = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    return { vendors: [], error: new Error(`Missing environment variables: ${missing.join(", ")}`) };
  }

  const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const fetchVendors = () => supabase
    .from("vendors")
    .select("slug,updated_at,city,business_name,description,logo_url,categories(name)")
    .eq("is_verified", true)
    .eq("management_status", "active")
    .eq("public_profile_enabled", true)
    .not("slug", "is", null);

  let data = null;
  let error = null;
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    ({ data, error } = await fetchVendors());
    if (!error) break;
    if (attempt < maxAttempts) {
      console.warn(`Vendor SEO query failed (${attempt}/${maxAttempts}): ${error.message}. Retrying…`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  if (error) return { vendors: [], error };

  const vendors = (data ?? []).map((row) => {
    const category = Array.isArray(row.categories) ? row.categories[0]?.name : row.categories?.name;
    return {
      slug: String(row.slug ?? ""),
      name: String(row.business_name ?? "").trim() || "RoyalLagn vendor",
      description: String(row.description ?? ""),
      city: String(row.city ?? ""),
      category: String(category ?? ""),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      image: typeof row.logo_url === "string" ? row.logo_url : null,
    };
  });
  return { vendors, error: null };
}
