import { access, mkdir, writeFile } from "node:fs/promises";
import { buildSeoPages, sitemapXml } from "../lib/seo/publicSeo.ts";
import { loadSeoVendors } from "./seo-vendors.mjs";

const sitemapPath = new URL("../public/sitemap.xml", import.meta.url);
const { vendors, error } = await loadSeoVendors();

if (error) {
  try {
    await access(sitemapPath);
    console.warn(`Unable to refresh vendors for sitemap: ${error.message}. Keeping the checked-in sitemap.`);
    process.exit(0);
  } catch {
    console.error("Unable to fetch vendors for sitemap and no fallback sitemap exists:", error.message);
    process.exit(1);
  }
}

const xml = sitemapXml(buildSeoPages(vendors));
await mkdir(new URL("../public", import.meta.url), { recursive: true });
await writeFile(sitemapPath, xml, "utf8");
const vendorCount = vendors.filter((vendor) => vendor.slug).length;
console.log(`Wrote public/sitemap.xml with ${vendorCount} vendor profiles and the public discovery pages.`);
