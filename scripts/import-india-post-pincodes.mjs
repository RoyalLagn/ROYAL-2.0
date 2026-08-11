#!/usr/bin/env node

// Imports the official India Post / data.gov.in all-India PIN directory into
// the canonical geo hierarchy and locality tables. This script contains no
// PIN or place-specific rules. Supply either a CSV downloaded from the OGD
// resource or configured DATA_GOV_IN_* credentials for paged API ingestion.

import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ""; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== '\r') field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((value) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  return rows.slice(1)
    .filter((values) => values.some((value) => value.trim()))
    .map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const valueOf = (row, ...names) => {
  for (const name of names) {
    const value = row[name.toLowerCase().replace(/[^a-z0-9]/g, "")];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return "";
};

export function normalizeIndiaPostRow(row) {
  return {
    pincode: valueOf(row, "pincode", "pin"),
    officename: valueOf(row, "officename", "office_name", "name"),
    officetype: valueOf(row, "officetype", "office_type", "branchtype"),
    deliverystatus: valueOf(row, "deliverystatus", "delivery", "delivery_status"),
    taluk: valueOf(row, "taluk", "taluka", "block", "subdistrict"),
    districtname: valueOf(row, "districtname", "district_name", "district"),
    statename: valueOf(row, "statename", "state_name", "state"),
    latitude: valueOf(row, "latitude", "lat"),
    longitude: valueOf(row, "longitude", "long", "lng"),
    circlename: valueOf(row, "circlename", "circle_name", "circle"),
    regionname: valueOf(row, "regionname", "region_name", "region"),
    divisionname: valueOf(row, "divisionname", "division_name", "division"),
  };
}

export function validateOfficialRows(rows) {
  const normalized = rows.map(normalizeIndiaPostRow);
  const valid = normalized.filter((row) => /^[1-9][0-9]{5}$/.test(row.pincode)
    && row.officename && row.districtname && row.statename);
  if (!valid.length) throw new Error("No valid India Post records were found in the supplied dataset.");
  return valid;
}

async function loadApiRows(apiKey, resourceId) {
  const output = [];
  const limit = 1000;
  for (let offset = 0; ; offset += limit) {
    const url = new URL(`https://api.data.gov.in/resource/${resourceId}`);
    url.searchParams.set("api-key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Official data.gov.in request failed (${response.status}).`);
    const body = await response.json();
    const records = Array.isArray(body?.records) ? body.records : [];
    output.push(...records);
    if (records.length < limit) break;
  }
  return output;
}

async function main() {
  const args = process.argv.slice(2);
  const fileIndex = args.indexOf("--file");
  const useApi = args.includes("--api");
  if (fileIndex < 0 && !useApi) {
    throw new Error("Usage: node scripts/import-india-post-pincodes.mjs --file <official.csv> OR --api");
  }

  if (useApi && (!process.env.DATA_GOV_IN_API_KEY || !process.env.DATA_GOV_IN_PINCODE_RESOURCE_ID)) {
    throw new Error("DATA_GOV_IN_API_KEY and DATA_GOV_IN_PINCODE_RESOURCE_ID are required for --api.");
  }
  const rawRows = fileIndex >= 0
    ? parseCsv(await readFile(args[fileIndex + 1], "utf8"))
    : await loadApiRows(process.env.DATA_GOV_IN_API_KEY, process.env.DATA_GOV_IN_PINCODE_RESOURCE_ID);
  const rows = validateOfficialRows(rawRows);
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const batchSize = 500;
  let imported = 0;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { data, error } = await client.rpc("import_india_post_pincode_batch", { rows: batch });
    if (error) throw error;
    imported += Number(data?.records_imported ?? batch.length);
    process.stdout.write(`\rImported ${imported}/${rows.length} official post-office rows`);
  }
  process.stdout.write("\nIndia Post PIN import completed.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
