import { stdin as input, stdout as output } from "node:process";
import { mkdir, writeFile } from "node:fs/promises";

const apply = process.argv.includes("--apply");
const uploadOnly = process.argv.includes("--upload-only");
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Supabase URL, anon key, and service-role key are required.");
}

const cloudinaryPattern = /^https:\/\/res\.cloudinary\.com\//i;
const bunnyPattern = /^https:\/\/[^/]+\.b-cdn\.net\//i;
const tables = [
  {
    table: "vendor_portfolio_media",
    fields: ["secure_url", "thumbnail_url", "optimized_url", "hero_url", "fullscreen_url", "video_poster_url"],
    primaryField: "secure_url",
    buildPatch: (_row, uploaded) => ({
      secure_url: uploaded.publicUrl,
      thumbnail_url: uploaded.publicUrl,
      optimized_url: uploaded.publicUrl,
      hero_url: uploaded.publicUrl,
      fullscreen_url: uploaded.publicUrl,
      public_id: uploaded.objectKey,
      updated_at: new Date().toISOString(),
    }),
  },
  { table: "vendors", fields: ["logo_url"] },
  { table: "categories", fields: ["icon_url"] },
  { table: "profiles", fields: ["profile_image"] },
  { table: "vendor_applications", fields: ["logo_url", "cover_image_url"] },
];

function restHeaders(key = serviceRoleKey) {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = text; }
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${url} failed (${response.status}): ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }
  return payload;
}

async function readCredentials() {
  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("Run --apply in an interactive terminal so credentials are not echoed or stored.");
  }
  const readLine = (prompt, hidden = false) => new Promise((resolve, reject) => {
    let value = "";
    output.write(prompt);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Migration cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          resolve(value);
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value) {
            value = value.slice(0, -1);
            if (!hidden) output.write("\b \b");
          }
          continue;
        }
        value += character;
        if (!hidden) output.write(character);
      }
    };
    input.on("data", onData);
  });
  const email = String(await readLine("Supabase login email: ")).trim();
  const password = String(await readLine("Supabase login password: ", true));
  if (!email || !password) throw new Error("Email and password are required.");
  return { email, password };
}

async function login(email, password) {
  const payload = await requestJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!payload?.access_token) throw new Error("Supabase login did not return an access token.");
  return payload.access_token;
}

async function loadPlan() {
  const plan = [];
  for (const config of tables) {
    const rows = await requestJson(`${supabaseUrl}/rest/v1/${config.table}?select=*`, {
      headers: restHeaders(),
    });
    for (const row of rows) {
      if (config.primaryField) {
        const sourceUrl = row[config.primaryField];
        if (cloudinaryPattern.test(sourceUrl ?? "")) {
          plan.push({ config, row, sourceUrl, fields: config.fields.filter((field) => cloudinaryPattern.test(row[field] ?? "")) });
        }
        continue;
      }
      for (const field of config.fields) {
        const sourceUrl = row[field];
        if (cloudinaryPattern.test(sourceUrl ?? "")) plan.push({ config, row, sourceUrl, fields: [field] });
      }
    }
  }
  return plan;
}

function mimeFrom(response, url) {
  const raw = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (raw && /^image\/(jpeg|png|webp|heic|heif)$/.test(raw)) return raw;
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".heic")) return "image/heic";
  if (pathname.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

async function uploadOne(sourceUrl, accessToken) {
  const source = await fetch(sourceUrl);
  if (!source.ok) throw new Error(`Unable to download source (${source.status}): ${sourceUrl}`);
  const bytes = new Uint8Array(await source.arrayBuffer());
  const mimeType = mimeFrom(source, sourceUrl);
  const signed = await requestJson(`${supabaseUrl}/functions/v1/bunny-media-sign`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ purpose: "general", mimeType, fileSize: bytes.byteLength }),
  });
  if (!signed?.uploadUrl || !signed?.publicUrl || !signed?.objectKey) throw new Error("Bunny signer returned an incomplete response.");
  const uploaded = await fetch(signed.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: bytes });
  if (!uploaded.ok) throw new Error(`Bunny upload failed (${uploaded.status}) for ${sourceUrl}`);
  let verified = false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const check = await fetch(`${signed.publicUrl}?migration_check=${Date.now()}`, { method: "GET", headers: { Range: "bytes=0-0" } });
    if (check.ok && Number(check.headers.get("content-length") ?? 0) > 0) { verified = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  if (!verified) throw new Error(`Bunny CDN verification failed for ${signed.publicUrl}`);
  return { sourceUrl, publicUrl: signed.publicUrl, objectKey: signed.objectKey, mimeType, bytes: bytes.byteLength };
}

async function patchRow(item, uploaded) {
  const patch = buildPatch(item, uploaded);
  const rows = await requestJson(`${supabaseUrl}/rest/v1/${item.config.table}?id=eq.${encodeURIComponent(item.row.id)}`, {
    method: "PATCH",
    headers: { ...restHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error(`Database update did not affect one ${item.config.table} row.`);
  return patch;
}

function buildPatch(item, uploaded) {
  return item.config.buildPatch
    ? item.config.buildPatch(item.row, uploaded)
    : Object.fromEntries(item.fields.map((field) => [field, uploaded.publicUrl]));
}

function sqlLiteral(value) {
  if (value === null) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

const plan = await loadPlan();
console.log(`Found ${plan.length} Cloudinary-backed database targets.`);
for (const item of plan) console.log(`- ${item.config.table}.${item.fields.join(",")} ${item.row.id}`);
if (!apply) {
  console.log("Dry run only. Re-run with --apply to copy assets and update verified URLs.");
  process.exit(0);
}

const credentials = await readCredentials();
const accessToken = await login(credentials.email, credentials.password);
const cache = new Map();
const manifest = { createdAt: new Date().toISOString(), cloudinaryDeleted: false, entries: [] };

for (const [index, item] of plan.entries()) {
  console.log(`[${index + 1}/${plan.length}] Migrating ${item.config.table}.${item.fields.join(",")} ${item.row.id}`);
  let uploaded = cache.get(item.sourceUrl);
  if (!uploaded) {
    uploaded = await uploadOne(item.sourceUrl, accessToken);
    cache.set(item.sourceUrl, uploaded);
  }
  const before = Object.fromEntries(item.fields.map((field) => [field, item.row[field]]));
  const patch = uploadOnly ? buildPatch(item, uploaded) : await patchRow(item, uploaded);
  manifest.entries.push({ table: item.config.table, id: item.row.id, before, after: patch, sourceUrl: item.sourceUrl, ...uploaded });
}

await mkdir(new URL("../data/migrations/", import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const manifestUrl = new URL(`../data/migrations/cloudinary-to-bunny-${stamp}.json`, import.meta.url);
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

if (uploadOnly) {
  const statements = manifest.entries.map((entry) => {
    const assignments = Object.entries(entry.after).map(([field, value]) => `${field} = ${sqlLiteral(value)}`).join(",\n  ");
    return `update public.${entry.table}\nset ${assignments}\nwhere id = ${sqlLiteral(entry.id)};`;
  });
  const sqlUrl = new URL(`../data/migrations/cloudinary-to-bunny-${stamp}.sql`, import.meta.url);
  const sql = ["begin;", ...statements, "commit;", ""].join("\n\n");
  await writeFile(sqlUrl, sql, "utf8");
  console.log(`Upload-only complete: ${manifest.entries.length} targets prepared; ${cache.size} unique files copied.`);
  console.log(`Transaction SQL: ${sqlUrl.pathname}`);
  console.log(`Rollback manifest: ${manifestUrl.pathname}`);
  process.exit(0);
}

const remaining = await loadPlan();
if (remaining.length) throw new Error(`${remaining.length} Cloudinary-backed targets remain after migration.`);
console.log(`Migration complete: ${manifest.entries.length} database targets updated; ${cache.size} unique files copied.`);
console.log(`Rollback manifest: ${manifestUrl.pathname}`);
console.log(`All migrated public URLs match Bunny: ${manifest.entries.every((entry) => bunnyPattern.test(entry.publicUrl))}`);
