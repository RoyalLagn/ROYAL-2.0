import { writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const required = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(2);
}

const base = (process.env.EXPO_PUBLIC_WEB_APP_URL?.trim() || process.env.EXPO_PUBLIC_APP_URL?.trim() || "https://royallagn.com").replace(/\/$/, "");
const publicPaths = [
  "/",
  "/Categories",
  "/NearbyVendors",
  "/Search",
  "/SearchByLocation",
  "/VendorsListing",
  "/BecomeVendor",
  "/Help",
  "/Terms",
  "/PrivacyPolicy",
];

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const { data, error } = await supabase
  .from("vendors")
  .select("slug,updated_at")
  .eq("is_verified", true)
  .eq("management_status", "active")
  .eq("public_profile_enabled", true)
  .not("slug", "is", null);

if (error) {
  console.error("Unable to fetch vendors for sitemap:", error.message);
  process.exit(1);
}

const staticUrls = publicPaths
  .map((path) => `  <url>\n    <loc>${base}${path}</loc>\n  </url>`);
const vendorUrls = (data ?? []).map((vendor) => {
  const slug = encodeURIComponent(vendor.slug);
  return `  <url>\n    <loc>${base}/vendors/${slug}</loc>\n    <lastmod>${new Date(vendor.updated_at).toISOString().slice(0, 10)}</lastmod>\n  </url>`;
});
const urls = [...staticUrls, ...vendorUrls].join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

await mkdir(new URL("../public", import.meta.url), { recursive: true });
await writeFile(new URL("../public/sitemap.xml", import.meta.url), xml, "utf8");

console.log(`Wrote public/sitemap.xml with ${publicPaths.length} public routes and ${data?.length ?? 0} vendor URLs.`);
