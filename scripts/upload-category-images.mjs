import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createBunnyUploader } from "./lib/bunny-upload.mjs";

const projectRoot = new URL("../", import.meta.url);
const envPath = new URL("../.env", import.meta.url);
const imageDirectory = new URL("../assets/images/category/", import.meta.url);
const manifestPath = new URL("../data/categoryImages.bunny.json", import.meta.url);

const uploads = [
  ["dj.png", "dj"],
  ["wedding-bands.png", "bands"],
  ["bridal-wear.png", "bridal-wear"],
  ["caterers.png", "caterers"],
  ["dance-choreography.png", "music-and-dance"],
  ["decorators.png", "decorators"],
  ["groom-wear.png", "groom-wear"],
  ["invites-cards.png", "invites-and-cards"],
  ["jewellery-accessories.png", "jewellery-and-accessories"],
  ["makeup-artists.png", "makeup-artists"],
  ["mehndi-artists.png", "mehndi-artists"],
  ["pandits.png", "pandits"],
  ["photographers.png", "photographers"],
  ["pre-wedding-shoot.png", "pre-wedding-shoot"],
  ["venues.png", "venues"],
];

function parseEnv(source) {
  return Object.fromEntries(
    source
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
        return [key, value];
      }),
  );
}

async function urlExists(url) {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false;
  }
}

const env = parseEnv(await readFile(envPath, "utf8"));
const uploadToBunny = await createBunnyUploader(env);

let manifest = {};
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  manifest = {};
}

const nextManifest = {};

for (const [fileName] of uploads) {
  const previousUrl = manifest[fileName];
  if (previousUrl && await urlExists(previousUrl)) {
    nextManifest[fileName] = previousUrl;
    console.log(`skip ${fileName}`);
    continue;
  }

  const bytes = await readFile(new URL(fileName, imageDirectory));
  nextManifest[fileName] = await uploadToBunny(bytes, "image/png");
  console.log(`upload ${fileName}`);
}

await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
console.log(`saved ${join(new URL(".", projectRoot).pathname, "data/categoryImages.bunny.json")}`);
