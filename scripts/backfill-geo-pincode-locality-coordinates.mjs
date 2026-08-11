#!/usr/bin/env node

// Targeted, low-risk coordinate backfill for geo_pincode_localities.
//
// Scope: only fills latitude/longitude on EXISTING locality rows that are
// currently missing them (matched by PIN + base office/locality name, S.O/
// B.O suffix stripped for matching only). Never inserts a new locality row,
// never deletes a row, never overwrites a non-null coordinate. All of that
// enforcement lives server-side in public.backfill_geo_pincode_locality_
// coordinates (see supabase/migrations/20260812010000_backfill_geo_pincode_
// locality_coordinates.sql) -- this script is just a thin CSV feeder.
//
// Deliberately does NOT import or call anything from
// scripts/import-india-post-pincodes.mjs's Supabase/RPC path -- only reuses
// its pure, side-effect-free parseCsv() function, so that file stays
// completely untouched and uninvoked.
//
// Usage:
//   node --env-file=.env scripts/backfill-geo-pincode-locality-coordinates.mjs --file india-pincodes.csv.csv --dry-run
//   node --env-file=.env scripts/backfill-geo-pincode-locality-coordinates.mjs --file india-pincodes.csv.csv

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { parseCsv } from "./import-india-post-pincodes.mjs";

const valueOf = (row, ...names) => {
  for (const name of names) {
    const value = row[name.toLowerCase().replace(/[^a-z0-9]/g, "")];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
};

function normalizeRow(row) {
  return {
    pincode: valueOf(row, "pincode", "pin"),
    officename: valueOf(row, "officename", "office_name", "name"),
    latitude: valueOf(row, "latitude", "lat"),
    longitude: valueOf(row, "longitude", "long", "lng"),
  };
}

async function fetchPincodesMissingCoordinates(client) {
  const { data, error } = await client
    .from("geo_pincode_localities")
    .select("pincode")
    .or("latitude.is.null,longitude.is.null");
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.pincode));
}

function addCounts(total, part) {
  for (const key of Object.keys(part)) {
    if (key === "dry_run") continue;
    total[key] = (total[key] ?? 0) + Number(part[key] ?? 0);
  }
  return total;
}

async function main() {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf("--file");
  const dryRun = args.includes("--dry-run");
  if (fileIndex < 0) {
    throw new Error("Usage: node scripts/backfill-geo-pincode-locality-coordinates.mjs --file <india-post.csv> [--dry-run]");
  }

  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Targeted, not a nationwide sweep: only send CSV rows for PINs that
  // currently have at least one null-coordinate locality row. With today's
  // near-empty cache table this keeps the payload tiny and keeps the scope
  // exactly matching "backfill what's missing", never touching PINs that
  // haven't been looked up yet (that would require inserting new rows,
  // which this backfill never does).
  const targetPincodes = await fetchPincodesMissingCoordinates(client);
  if (!targetPincodes.size) {
    console.log("No geo_pincode_localities rows are missing coordinates. Nothing to do.");
    return;
  }
  console.log(`Pincodes with at least one missing coordinate: ${targetPincodes.size}`);

  const rawRows = parseCsv(await readFile(args[fileIndex + 1], "utf8"));
  const rows = rawRows.map(normalizeRow).filter((row) => targetPincodes.has(row.pincode));
  console.log(`Matching CSV rows for those pincodes: ${rows.length}`);
  if (!rows.length) {
    console.log("None of the target pincodes were found in the supplied CSV. Nothing to do.");
    return;
  }

  const batchSize = 500;
  const totals = {
    rows_scanned: 0, rows_matched: 0, rows_updated: 0,
    rows_skipped_already_set: 0, rows_skipped_invalid_source: 0,
    rows_not_matched: 0, rows_inserted: 0, rows_deleted: 0,
  };
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { data, error } = await client.rpc("backfill_geo_pincode_locality_coordinates", {
      rows: batch,
      p_dry_run: dryRun,
    });
    if (error) throw error;
    addCounts(totals, data);
  }

  console.log(`\n${dryRun ? "DRY RUN -- no writes performed" : "Backfill executed"}`);
  console.log(JSON.stringify(totals, null, 2));
  if (totals.rows_inserted !== 0 || totals.rows_deleted !== 0) {
    throw new Error("Invariant violated: rows_inserted/rows_deleted must always be 0.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
