import { Blob } from "node:buffer";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

const envSource = await readFile(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(
  envSource
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2"),
      ];
    }),
);

const cloudName = env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const uploadPreset = env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
const assetVersion = process.argv[2] ?? "v2";
if (!/^v\d+$/.test(assetVersion)) throw new Error("Asset version must look like v2 or v3.");
if (!cloudName || !uploadPreset) {
  throw new Error("Cloudinary public configuration is missing.");
}

const names = [
  "venues",
  "caterers",
  "photographers",
  "decorators",
  "djs",
  "makeup-artists",
  "mehndi-artists",
  "bridal-wear",
  "groom-wear",
  "jewellery-accessories",
  "pandits",
  "invites-cards",
  "dance-choreography",
  "pre-wedding-shoot",
  "wedding-bands",
];
const directory = new URL(`../assets/images/category-icons-${assetVersion}/`, import.meta.url);
const versionLabel = assetVersion[0].toUpperCase() + assetVersion.slice(1);
const manifestUrl = new URL(`../data/categoryIcons${versionLabel}.cloudinary.json`, import.meta.url);
let manifest = {};
try {
  manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
} catch {
  manifest = {};
}

for (const name of names) {
  const fileName = `${name}.png`;
  if (manifest[fileName]) {
    console.log(`Keeping ${fileName}`);
    continue;
  }
  const bytes = await readFile(new URL(fileName, directory));
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/png" }), basename(fileName));
  form.append("upload_preset", uploadPreset);
  form.append("public_id", `royallagn/category-icons-${assetVersion}/${name}`);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const payload = await response.json();
  if (!response.ok || !payload.secure_url) {
    throw new Error(`Upload failed for ${fileName}: ${payload.error?.message ?? response.status}`);
  }
  manifest[fileName] = payload.secure_url;
  console.log(`Uploaded ${fileName}`);
}

await writeFile(
  manifestUrl,
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(`Saved data/categoryIcons${versionLabel}.cloudinary.json`);
