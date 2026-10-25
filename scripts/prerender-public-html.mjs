import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applySeoToHtml, buildSeoPages, TAB_TITLE } from "../lib/seo/publicSeo.ts";
import { loadSeoVendors } from "./seo-vendors.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, process.argv[2] || "dist");
const shellPath = join(dist, "index.html");

let shell;
try {
  shell = await readFile(shellPath, "utf8");
} catch {
  console.error(`Missing ${shellPath}. Run the Expo web export before prerendering.`);
  process.exit(1);
}

const { vendors, error } = await loadSeoVendors();
if (error) {
  console.warn(`Prerender is continuing with static pages only: ${error.message}`);
}

const pages = buildSeoPages(vendors);
for (const page of pages) {
  const html = applySeoToHtml(shell, page);
  if (!html.includes(`<title>${TAB_TITLE}</title>`)) {
    throw new Error(`Prerender changed the browser title for ${page.path}.`);
  }
  const file = page.path === "/" ? shellPath : join(dist, page.path.replace(/^\//, ""), "index.html");
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html, "utf8");
}

console.log(`Prerendered ${pages.length} public HTML pages into ${dist}.`);
