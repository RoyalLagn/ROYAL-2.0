import { writeFile, mkdir } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

try {
  loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

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
  "/BecomeVendor",
  "/Help",
  "/Terms",
  "/PrivacyPolicy",
];

function slugify(value) {
  return value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const canonicalCategorySlugs = new Map([
  ["venue", "venues"], ["wedding-hall", "venues"],
  ["caterer", "caterers"], ["catering", "caterers"],
  ["photographer", "photographers"], ["photography", "photographers"],
  ["decorator", "decorators"], ["decor", "decorators"],
  ["makeup-artist", "makeup-artists"], ["makeup", "makeup-artists"],
  ["mehndi-artist", "mehndi-artists"], ["mehendi-artist", "mehndi-artists"],
  ["dj", "djs"], ["bridal-outfit", "bridal-wear"], ["groom-outfit", "groom-wear"],
  ["jewellery", "jewellery-accessories"], ["jewelry", "jewellery-accessories"],
  ["pandit", "pandits"], ["invites", "invites-cards"],
  ["pre-wedding-shoots", "pre-wedding-shoot"], ["music-and-dance", "music-dance"],
]);

function categoryRouteSlug(value) {
  const slug = slugify(value);
  return canonicalCategorySlugs.get(slug) ?? slug;
}

function xmlEscape(value) {
  return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character]);
}

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const { data, error } = await supabase
  .from("vendors")
  .select("slug,updated_at,city,categories(name)")
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
  return `  <url>\n    <loc>${base}/vendor/${slug}</loc>\n    <lastmod>${new Date(vendor.updated_at).toISOString().slice(0, 10)}</lastmod>\n  </url>`;
});
const discoveryPaths = new Set();
for (const vendor of data ?? []) {
  const category = Array.isArray(vendor.categories) ? vendor.categories[0]?.name : vendor.categories?.name;
  if (!category) continue;
  const categoryPath = `/wedding-${categoryRouteSlug(category)}`;
  discoveryPaths.add(categoryPath);
  if (vendor.city?.trim()) discoveryPaths.add(`${categoryPath}/${slugify(vendor.city)}`);
}
const discoveryUrls = [...discoveryPaths].sort().map((path) => `  <url>\n    <loc>${xmlEscape(`${base}${path}`)}</loc>\n  </url>`);
const urls = [...staticUrls, ...discoveryUrls, ...vendorUrls].join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

await mkdir(new URL("../public", import.meta.url), { recursive: true });
await writeFile(new URL("../public/sitemap.xml", import.meta.url), xml, "utf8");

console.log(`Wrote public/sitemap.xml with ${publicPaths.length} public routes, ${discoveryUrls.length} discovery URLs, and ${data?.length ?? 0} vendor URLs.`);
