import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  mediaService,
  streamService,
  clipAdapter,
  portfolioSigner,
  clipSigner,
  clipStreamUpload,
  statusFunction,
  portfolioDelete,
  publicClipPlayer,
  portfolioPlayer,
  categoryIcons,
  categoryImages,
  exampleEnv,
] = await Promise.all([
  read("services/media.ts"),
  read("services/bunnyStream.ts"),
  read("clips/services/ClipBunnyNativeAdapter.ts"),
  read("supabase/functions/portfolio-media-sign/index.ts"),
  read("supabase/functions/clip-upload-sign/index.ts"),
  read("supabase/functions/bunny-stream-upload/index.ts"),
  read("supabase/functions/bunny-stream-status/index.ts"),
  read("supabase/functions/portfolio-media-delete/index.ts"),
  read("clips/components/PublicClipVideo.tsx"),
  read("components/vendor/PortfolioVideoPlayer.tsx"),
  read("scripts/upload-category-icons-v2.mjs"),
  read("scripts/upload-category-images.mjs"),
  read(".env.example"),
]);

for (const [name, source] of [
  ["media service", mediaService],
  ["clip adapter", clipAdapter],
  ["portfolio signer", portfolioSigner],
  ["clip signer", clipSigner],
  ["category icon uploader", categoryIcons],
  ["category image uploader", categoryImages],
]) {
  const retiredProvider = ["cloud", "inary"].join("");
  assert.doesNotMatch(source, new RegExp(`(?:res|api)\\.${retiredProvider}\\.com`), `${name} must remain Bunny-only.`);
}

assert.match(mediaService, /uploadToBunnyStream[\s\S]*waitForBunnyStreamReady/, "Portfolio videos must upload to Bunny Stream and wait for processing.");
assert.match(streamService, /new tus\.Upload\(file,[\s\S]*removeFingerprintOnSuccess: true/, "Web video uploads must use a real File with Bunny TUS.");
assert.match(clipAdapter, /data\.provider !== "bunny"[\s\S]*unsupported upload provider/, "Clip uploads must reject non-Bunny authorization.");
assert.match(clipAdapter, /\[CLIP-UPLOAD\] CLIENT_FILE[\s\S]*uploadBunnyObject\(data, input[\s\S]*bunny-stream-upload[\s\S]*sourceUrl: data\.publicUrl/, "Clip videos must upload to Bunny Storage before requesting a server-side Stream import.");
assert.doesNotMatch(clipAdapter, /tus-js-client|uploadBunnyTus|\/tusupload|AuthorizationSignature|Upload-Offset/, "The active Clip upload adapter must not contain TUS code.");
assert.match(clipStreamUpload, /STORAGE_VERIFY[\s\S]*storageBytes: sourceBytes/, "The Edge Function must verify the staged Bunny Storage object size.");
assert.match(clipStreamUpload, /presignBunnyObject\("GET", sourceObjectKey[\s\S]*videos\/fetch[\s\S]*JSON\.stringify\(\{ url: importUrl, title \}\)/, "The Edge Function must import the staged source from an authoritative signed Bunny Storage URL.");
assert.match(clipStreamUpload, /BUNNY_VERIFY[\s\S]*storageSize: Number\(video\.storageSize \|\| 0\)/, "The Edge Function must log Bunny Stream storage verification.");
assert.match(clipStreamUpload, /Number\(video\.storageSize \|\| 0\) <= 0[\s\S]*method: "DELETE"[\s\S]*Bunny URL Fetch did not store/, "A zero-byte Stream import must fail and clean up before database finalization.");
assert.match(portfolioSigner, /uploadMode: "tus"[\s\S]*bunny-stream:/, "Portfolio video signing must return Bunny Stream TUS authorization.");
assert.match(
  await read("supabase/functions/_shared/bunnyS3.ts"),
  /uploadMode: "signed" as const/,
  "Bunny Storage presigned uploads must identify their upload mode to clients.",
);
assert.match(
  await read("supabase/functions/_shared/bunnyS3.ts"),
  /endpoint\.hostname\.split\("\."\)\[0\][\s\S]*region,/,
  "Bunny Storage signatures must use the endpoint's region rather than a hard-coded one.",
);
assert.doesNotMatch(clipSigner, /\/tusupload|AuthorizationSignature|AuthorizationExpire|Upload-Offset/, "The Clip signer must not expose legacy TUS authorization.");
assert.match(statusFunction, /READY_STATUSES = new Set\(\[3, 4\]\)[\s\S]*FAILED_STATUSES = new Set\(\[5, 8\]\)[\s\S]*storageSize > 0/, "Bunny processing verification must require a finished, non-empty video.");
assert.match(portfolioDelete, /bunny-stream:\(\[0-9a-f-\]\+\)[\s\S]*method: "DELETE"/, "Portfolio cleanup must delete Bunny Stream objects.");
assert.doesNotMatch(publicClipPlayer, /embed\/750524/, "The Bunny library ID must not be hardcoded in the public Clip player.");
assert.match(publicClipPlayer, /EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID/, "The public Clip player must use environment configuration.");
assert.match(portfolioPlayer, /EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID[\s\S]*iframe/, "Portfolio Bunny HLS playback must use Bunny's web player.");
for (const key of [
  "EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID",
  "BUNNY_STORAGE_ZONE",
  "BUNNY_STORAGE_CDN_HOSTNAME",
  "BUNNY_STREAM_LIBRARY_ID",
  "BUNNY_STREAM_CDN_HOSTNAME",
  "BUNNY_STREAM_API_KEY",
]) assert.match(exampleEnv, new RegExp(`^${key}=`, "m"), `.env.example must document ${key}.`);

console.log("Bunny media migration guards passed.");
