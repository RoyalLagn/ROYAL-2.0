import { Blob } from "node:buffer";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const projectRoot = new URL("../", import.meta.url);
const envPath = new URL("../.env", import.meta.url);
const imageDirectory = new URL("../assets/images/category/", import.meta.url);
const manifestPath = new URL("../data/categoryImages.cloudinary.json", import.meta.url);

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
const cloudName = env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const uploadPreset = env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

if (!cloudName || !uploadPreset) {
  throw new Error(
    "Missing EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME or EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET in .env.",
  );
}

let manifest = {};
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch {
  manifest = {};
}

const nextManifest = {};

for (const [fileName, slug] of uploads) {
  const previousUrl = manifest[fileName];
  if (previousUrl && await urlExists(previousUrl)) {
    nextManifest[fileName] = previousUrl;
    console.log(`skip ${fileName}`);
    continue;
  }

  const deterministicUrl =
    `https://res.cloudinary.com/${cloudName}/image/upload/royallagn/categories/${slug}.png`;
  if (await urlExists(deterministicUrl)) {
    nextManifest[fileName] = deterministicUrl;
    console.log(`reuse ${fileName}`);
    continue;
  }

  const bytes = await readFile(new URL(fileName, imageDirectory));
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), basename(fileName));
  form.append("upload_preset", uploadPreset);
  form.append("public_id", `royallagn/categories/${slug}`);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const payload = await response.json();

  if (!response.ok || !payload.secure_url) {
    throw new Error(`Upload failed for ${fileName}: ${payload.error?.message ?? response.status}`);
  }

  nextManifest[fileName] = payload.secure_url;
  console.log(`upload ${fileName}`);
}

await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
console.log(`saved ${join(new URL(".", projectRoot).pathname, "data/categoryImages.cloudinary.json")}`);
