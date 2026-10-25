import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CATEGORIES,
  INDEXABLE_ROBOTS,
  PRIVATE_PREFIXES,
  TAB_TITLE,
  applySeoToHtml,
  buildSeoPages,
  canonicalUrl,
  isListingPath,
  isPrivatePath,
  isVendorProfilePath,
  robotsTxt,
  sitemapXml,
} from "../lib/seo/publicSeo.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const categorySource = readFileSync(new URL("../data/marketplaceCategories.ts", import.meta.url), "utf8");
const categorySlugs = [...categorySource.matchAll(/slug: "([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(CATEGORIES.map((category) => category.slug), categorySlugs, "SEO categories must match the marketplace category list.");

assert.equal(isVendorProfilePath("/vendor/tejas-photography-pune"), true);
assert.equal(isPrivatePath("/vendor/tejas-photography-pune"), false);
assert.equal(isPrivatePath("/VendorLogin"), true);
assert.equal(isPrivatePath("/vendor-dashboard"), true);
assert.equal(isPrivatePath("/vendor-marketing-center"), true);
assert.equal(isPrivatePath("/AdminBookings"), true);
assert.equal(isPrivatePath("/bookings"), true);
assert.equal(isPrivatePath("/profile"), true);
assert.equal(isListingPath("/wedding-photographers"), true);
assert.equal(isListingPath("/wedding-photographers/pune"), true);
assert.equal(isListingPath("/wedding-photographers/pune/extra"), false);
assert.equal(canonicalUrl("/vendor/tejas-photography-pune"), "https://royallagn.com/vendor/tejas-photography-pune");
assert.equal(canonicalUrl("/"), "https://royallagn.com/");

const robots = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf8");
assert.equal(robots.replace(/\r\n/g, "\n"), robotsTxt().replace(/\r\n/g, "\n"));
const shellTemplate = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
for (const prefix of PRIVATE_PREFIXES) {
  assert.match(shellTemplate, new RegExp(prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}
assert.match(shellTemplate, /document\.title = "RoyalLagn"/);
assert.match(robots, /Allow: \/vendor\//);
assert.match(robots, /Disallow: \/vendor-/);
assert.match(robots, /Disallow: \/Vendor/);
assert.doesNotMatch(robots, /Disallow: \/vendor\//);
assert.match(robots, /Sitemap: https:\/\/royallagn\.com\/sitemap\.xml/);

const shell = `<!DOCTYPE html><html><head><title>Old title</title><link rel="icon" href="/favicon.ico"><link rel="canonical" href="https://royallagn.com/"><meta name="description" content="old"></head><body><div id="root"></div><script src="/_expo/static/js/app.js" defer></script></body></html>`;
const [vendorPage] = buildSeoPages([{
  slug: "camera-pune",
  name: "Camera Pune",
  description: "Wedding photography in Pune with a verified RoyalLagn profile.",
  city: "Pune",
  category: "Photographer",
  updatedAt: "2026-10-15T00:00:00.000Z",
  image: "https://res.cloudinary.com/demo/image/upload/camera.jpg",
}]).filter((page) => page.path === "/vendor/camera-pune");

const html = applySeoToHtml(shell, vendorPage);
assert.match(html, new RegExp(`<title>${TAB_TITLE}</title>`));
assert.doesNotMatch(html, /Old title/);
assert.match(html, /rel="canonical" href="https:\/\/royallagn\.com\/vendor\/camera-pune"/);
assert.match(html, /Wedding photography in Pune/);
assert.match(html, /property="og:title" content="Camera Pune"/);
assert.match(html, /"@type":"LocalBusiness"/);
assert.match(html, /id="royallagn-crawl-snapshot"/);
assert.match(html, /href="https:\/\/royallagn\.com\/wedding-photographers"/);
assert.match(html, /href="\/favicon\.ico"/);
assert.match(html, /src="\/_expo\/static\/js\/app\.js"/);
assert.match(html, new RegExp(`name="robots" content="${INDEXABLE_ROBOTS}"`));
const titles = html.match(/<title>/g) ?? [];
assert.equal(titles.length, 1);

const nested = applySeoToHtml(shell.replace('src="/_expo', 'src="_expo'), vendorPage);
assert.match(nested, /src="\/_expo\/static\/js\/app\.js"/);

const xml = sitemapXml(buildSeoPages([]));
assert.match(xml, /<loc>https:\/\/royallagn\.com\/<\/loc>/);
assert.match(xml, /<loc>https:\/\/royallagn\.com\/About<\/loc>/);
assert.match(xml, /<loc>https:\/\/royallagn\.com\/wedding-photographers<\/loc>/);
assert.doesNotMatch(xml, /AdminLogin|vendor-dashboard|\/bookings/);

const vercel = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
assert.doesNotMatch(vercel, /www\.royallagn\.com/, "Do not add a www redirect while Vercel already redirects the apex domain to www.");

assert.match(root, /[\\/]$/);
console.log("SEO public checks passed.");
