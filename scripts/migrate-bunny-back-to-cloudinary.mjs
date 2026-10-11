import fs from "fs";
import path from "path";
import https from "https";
import { createClient } from "@supabase/supabase-js";

// Read local .env
function loadEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) throw new Error(".env not found");
  const content = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const cloudName = env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || "hp6vu8o9";

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase configuration in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const isApply = process.argv.includes("--apply");
const isDryRun = !isApply || process.argv.includes("--dry-run");

console.log("==================================================");
console.log(`MODE: ${isApply ? "APPLY (LIVE DATABASE UPDATES)" : "DRY RUN (NO DB WRITES)"}`);
console.log(`Cloudinary Cloud: ${cloudName}`);
console.log("==================================================\n");

function verifyUrl(url) {
  return new Promise((resolve) => {
    if (!url) return resolve({ ok: false, status: 0 });
    try {
      https.get(url, (res) => {
        resolve({ ok: res.statusCode === 200, status: res.statusCode });
      }).on("error", (err) => {
        resolve({ ok: false, status: 0, error: err.message });
      });
    } catch (e) {
      resolve({ ok: false, status: 0, error: e.message });
    }
  });
}

function buildCloudinaryDerivedUrl(secureUrl, transform) {
  if (!secureUrl.includes("/upload/")) return secureUrl;
  const parts = secureUrl.split("/upload/");
  return `${parts[0]}/upload/${transform}/${parts[1]}`;
}

async function run() {
  // 1. Load historical mappings
  const historicalJsonPath = path.resolve("data/migrations/cloudinary-to-bunny-2026-09-12T15-23-31-111Z.json");
  const categoryJsonPath = path.resolve("data/categoryImages.cloudinary.json");

  let historicalEntries = [];
  if (fs.existsSync(historicalJsonPath)) {
    const raw = JSON.parse(fs.readFileSync(historicalJsonPath, "utf8"));
    historicalEntries = raw.entries || [];
  }

  let categoryMappings = {};
  if (fs.existsSync(categoryJsonPath)) {
    categoryMappings = JSON.parse(fs.readFileSync(categoryJsonPath, "utf8"));
  }

  console.log(`Loaded ${historicalEntries.length} historical mapping entries.`);
  console.log(`Loaded ${Object.keys(categoryMappings).length} category mappings.\n`);

  // Build lookup index: table -> id -> entry
  const historicalByTableId = new Map();
  for (const entry of historicalEntries) {
    historicalByTableId.set(`${entry.table}:${entry.id}`, entry);
  }

  const results = [];

  // ----------------------------------------------------
  // TABLE 1: categories
  // ----------------------------------------------------
  console.log("--- Scanning categories ---");
  const { data: categories, error: catError } = await supabase.from("categories").select("*");
  if (catError) throw catError;

  // Category name normalization map to match categoryImages.cloudinary.json
  const categoryFileMap = {
    "mehendi artist": "mehendi artist.png",
    "mehndi artist": "mehendi artist.png",
    "jewellery": "jewelwry & accessories.png",
    "pandit": "pandits.png",
    "invitation cards": "invite&cards.png",
    "dj": "DJ.png",
    "bridal wear": "bridal wear.png",
    "groom wear": "groom wear.png",
    "pre wedding shoot": "pre-wedding shoot.png",
    "wedding hall": "venues.png",
    "caterer": "caterers.png",
    "photographer": "photographer.png",
    "decorator": "decoraters.png",
    "makeup artist": "makeup.png",
    "choreographer": "dance.png",
    "live orchestra & band": "bands.png",
  };

  for (const cat of categories) {
    const normalizedName = cat.name.toLowerCase().trim();
    const mappedFile = categoryFileMap[normalizedName];
    const historicalCloudinaryUrl = mappedFile ? categoryMappings[mappedFile] : null;

    let targetUrl = historicalCloudinaryUrl;
    // Check if historical entry also exists
    const hist = historicalByTableId.get(`categories:${cat.id}`);
    if (hist && hist.before && hist.before.icon_url) {
      targetUrl = hist.before.icon_url;
    }

    if (targetUrl) {
      const verification = await verifyUrl(targetUrl);
      results.push({
        table: "categories",
        id: cat.id,
        name: cat.name,
        currentBunnyUrl: cat.home_image_url || cat.icon_url,
        cloudinaryUrl: targetUrl,
        verified: verification.ok,
        status: verification.status,
        action: "UPDATE home_image_url, fallback_image_url, icon_url",
        updates: {
          home_image_url: targetUrl,
          fallback_image_url: targetUrl,
          icon_url: targetUrl,
        },
      });
    }
  }

  // ----------------------------------------------------
  // TABLE 2: vendor_portfolio_media
  // ----------------------------------------------------
  console.log("--- Scanning vendor_portfolio_media ---");
  const { data: portfolio, error: portError } = await supabase.from("vendor_portfolio_media").select("*");
  if (portError) throw portError;

  for (const item of portfolio) {
    const hist = historicalByTableId.get(`vendor_portfolio_media:${item.id}`);
    if (hist && hist.before) {
      const canonicalUrl = hist.before.secure_url;
      const verification = await verifyUrl(canonicalUrl);

      // Extract public_id
      const publicIdMatch = canonicalUrl.match(/\/upload\/(?:v\d+\/)?([^.]+)/);
      const publicId = publicIdMatch ? publicIdMatch[1] : item.public_id;

      const thumbnailUrl = buildCloudinaryDerivedUrl(canonicalUrl, "c_limit,w_480,h_480,q_auto:eco,f_auto,fl_strip_profile");
      const optimizedUrl = buildCloudinaryDerivedUrl(canonicalUrl, "c_limit,w_1200,h_1200,q_auto:good,f_auto,fl_strip_profile");
      const heroUrl = buildCloudinaryDerivedUrl(canonicalUrl, "c_limit,w_1600,h_1600,q_auto:good,f_auto,fl_strip_profile");
      const fullscreenUrl = buildCloudinaryDerivedUrl(canonicalUrl, "c_limit,w_2200,h_2200,q_auto:good,f_auto,fl_strip_profile");

      results.push({
        table: "vendor_portfolio_media",
        id: item.id,
        currentBunnyUrl: item.secure_url,
        cloudinaryUrl: canonicalUrl,
        verified: verification.ok,
        status: verification.status,
        action: "UPDATE secure_url, thumbnail_url, optimized_url, hero_url, fullscreen_url, public_id",
        updates: {
          secure_url: canonicalUrl,
          thumbnail_url: thumbnailUrl,
          optimized_url: optimizedUrl,
          hero_url: heroUrl,
          fullscreen_url: fullscreenUrl,
          public_id: publicId,
        },
      });
    } else {
      // Unmapped net-new portfolio item
      results.push({
        table: "vendor_portfolio_media",
        id: item.id,
        currentBunnyUrl: item.secure_url,
        cloudinaryUrl: null,
        verified: false,
        status: 404,
        action: "UNMAPPED — Net-new asset requiring storage transfer",
        updates: null,
      });
    }
  }

  // ----------------------------------------------------
  // TABLE 3: vendors
  // ----------------------------------------------------
  console.log("--- Scanning vendors ---");
  const { data: vendors, error: venError } = await supabase.from("vendors").select("*");
  if (venError) throw venError;

  for (const ven of vendors) {
    const hist = historicalByTableId.get(`vendors:${ven.id}`);
    if (hist && hist.before && hist.before.logo_url) {
      const canonicalUrl = hist.before.logo_url;
      const verification = await verifyUrl(canonicalUrl);
      results.push({
        table: "vendors",
        id: ven.id,
        name: ven.business_name,
        currentBunnyUrl: ven.logo_url,
        cloudinaryUrl: canonicalUrl,
        verified: verification.ok,
        status: verification.status,
        action: "UPDATE logo_url",
        updates: {
          logo_url: canonicalUrl,
        },
      });
    }
  }

  // ----------------------------------------------------
  // TABLE 4: profiles
  // ----------------------------------------------------
  console.log("--- Scanning profiles ---");
  const { data: profiles, error: profError } = await supabase.from("profiles").select("*");
  if (profError) throw profError;

  for (const prof of profiles) {
    const hist = historicalByTableId.get(`profiles:${prof.id}`);
    if (hist && hist.before && hist.before.profile_image) {
      const canonicalUrl = hist.before.profile_image;
      const verification = await verifyUrl(canonicalUrl);
      results.push({
        table: "profiles",
        id: prof.id,
        name: prof.email || prof.full_name,
        currentBunnyUrl: prof.profile_image,
        cloudinaryUrl: canonicalUrl,
        verified: verification.ok,
        status: verification.status,
        action: "UPDATE profile_image",
        updates: {
          profile_image: canonicalUrl,
        },
      });
    }
  }

  // ----------------------------------------------------
  // TABLE 5: vendor_applications
  // ----------------------------------------------------
  console.log("--- Scanning vendor_applications ---");
  const { data: applications, error: appError } = await supabase.from("vendor_applications").select("*");
  if (appError) throw appError;

  for (const app of applications) {
    const hist = historicalByTableId.get(`vendor_applications:${app.id}`);
    if (hist && hist.before) {
      const logoUrl = hist.before.logo_url;
      const coverUrl = hist.before.cover_image_url;
      const logoVer = logoUrl ? await verifyUrl(logoUrl) : { ok: true, status: 200 };
      const coverVer = coverUrl ? await verifyUrl(coverUrl) : { ok: true, status: 200 };

      const updates = {};
      if (logoUrl) updates.logo_url = logoUrl;
      if (coverUrl) updates.cover_image_url = coverUrl;

      results.push({
        table: "vendor_applications",
        id: app.id,
        name: app.business_name,
        currentBunnyUrl: `${app.logo_url || ""} | ${app.cover_image_url || ""}`,
        cloudinaryUrl: `${logoUrl || ""} | ${coverUrl || ""}`,
        verified: logoVer.ok && coverVer.ok,
        status: `${logoVer.status}/${coverVer.status}`,
        action: "UPDATE logo_url, cover_image_url",
        updates,
      });
    }
  }

  // ----------------------------------------------------
  // DISPLAY RESULTS TABLE
  // ----------------------------------------------------
  console.log("\n==================================================");
  console.log("MIGRATION AUDIT / DRY RUN REPORT");
  console.log("==================================================\n");

  let totalMapped = 0;
  let totalVerified = 0;
  let totalUnmapped = 0;

  for (const r of results) {
    console.log(`[${r.table}] ID: ${r.id} (${r.name || ""})`);
    console.log(`  Current Bunny: ${r.currentBunnyUrl || "(none)"}`);
    console.log(`  Cloudinary URL: ${r.cloudinaryUrl || "(none)"}`);
    console.log(`  Verification:   HTTP ${r.status} (${r.verified ? "VERIFIED ALIVE" : "NOT VERIFIED"})`);
    console.log(`  Action:         ${r.action}`);
    console.log("--------------------------------------------------");

    if (r.cloudinaryUrl) {
      totalMapped++;
      if (r.verified) totalVerified++;
    } else {
      totalUnmapped++;
    }
  }

  console.log(`\nSUMMARY:`);
  console.log(`  Total Scanned:  ${results.length}`);
  console.log(`  Total Mapped:   ${totalMapped}`);
  console.log(`  Total Verified: ${totalVerified} (HTTP 200 OK)`);
  console.log(`  Total Unmapped: ${totalUnmapped}`);

  if (isDryRun) {
    console.log("\n[DRY RUN COMPLETE] Zero database rows were modified.");
    return;
  }

  // ----------------------------------------------------
  // APPLY MODE: DATABASE BACKUPS + UPDATES
  // ----------------------------------------------------
  console.log("\n==================================================");
  console.log("APPLYING DATABASE MIGRATION");
  console.log("==================================================");

  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // Create backups first
  console.log("\nCreating safety snapshot backup tables...");
  const backupTables = [
    "vendor_portfolio_media",
    "vendors",
    "categories",
    "profiles",
    "vendor_applications",
    "reviews"
  ];

  for (const tbl of backupTables) {
    const backupName = `_backup_${tbl}_${timestamp}`;
    fs.mkdirSync("data/backups", { recursive: true });
    const { data: rows, error: readErr } = await supabase.from(tbl).select("*");
    if (!readErr && rows) {
      fs.writeFileSync(`data/backups/${backupName}.json`, JSON.stringify(rows, null, 2), "utf8");
      console.log(`  [OK] Saved snapshot backup of ${tbl} (${rows.length} rows) to data/backups/${backupName}.json`);
    } else {
      console.warn(`  Warning: Could not read rows for ${tbl}:`, readErr?.message);
    }
  }

  // Apply updates
  console.log("\nApplying verified Cloudinary URL updates...");
  let updatedCount = 0;

  for (const r of results) {
    if (!r.updates || !r.verified) continue;

    const { error: updErr } = await supabase
      .from(r.table)
      .update(r.updates)
      .eq("id", r.id);

    if (updErr) {
      console.error(`  ERROR updating ${r.table} ID ${r.id}:`, updErr.message);
    } else {
      console.log(`  [OK] Updated ${r.table} ID ${r.id}`);
      updatedCount++;
    }
  }

  console.log(`\nSuccessfully updated ${updatedCount} records to live Cloudinary URLs!`);
}

run().catch((err) => {
  console.error("Migration script failed:", err);
  process.exit(1);
});
