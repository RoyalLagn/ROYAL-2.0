import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Supabase public environment is not configured.");
const client = createClient(url, key, { auth: { persistSession: false } });

const [{ data: cities, error: cityError }, { data: settings, error: settingError }] = await Promise.all([
  client.from("supported_cities").select("id,name,state,supported_areas(id,name)").eq("is_active", true).order("display_order"),
  client.from("location_settings").select("strict_city_only").eq("id", true).single(),
]);
if (cityError) throw cityError;
if (settingError) throw settingError;
if (!cities?.length) throw new Error("No active managed cities were returned.");

const { data: pincode, error: pincodeError } = await client.functions.invoke("lookup-india-pincode", {
  body: { pincode: "411001" },
});
if (pincodeError) {
  const responseBody = typeof pincodeError.context?.text === "function"
    ? await pincodeError.context.text().catch(() => "")
    : "";
  throw new Error(`PIN lookup failed${responseBody ? `: ${responseBody}` : "."}`);
}
if (!pincode || typeof pincode.supported !== "boolean") throw new Error("PIN lookup returned an invalid response.");

const { data: unsupported, error: unsupportedError } = await client.functions.invoke("lookup-india-pincode", {
  body: { pincode: "110001" },
});
if (unsupportedError) throw unsupportedError;
if (unsupported?.supported !== false || unsupported?.found !== true) {
  throw new Error("Unsupported-city PIN lookup did not return the expected blocked result.");
}

const { error: anonymousWriteError } = await client.from("supported_cities").insert({
  name: "RLS Probe",
  state: "RLS Probe",
  slug: `rls-probe-${Date.now()}`,
});
if (!anonymousWriteError) throw new Error("Anonymous location mutation was not blocked by RLS.");

const { error: directApplicationError } = await client.from("vendor_applications").insert({});
if (!directApplicationError || directApplicationError.code !== "42501") {
  throw new Error("Direct public Vendor-application insertion was not revoked.");
}

const { data: categories, error: categoryError } = await client.from("categories").select("id").limit(1);
if (categoryError || !categories?.[0]) throw categoryError ?? new Error("No category is available for the submission validation probe.");
const { error: unsupportedSubmissionError } = await client.functions.invoke("submit-vendor-application", {
  body: {
    full_name: "Location Security Probe",
    email: "location-security-probe@example.invalid",
    phone: "9876543210",
    business_name: "Location Security Probe",
    category_id: categories[0].id,
    description: "This request verifies that an unsupported Indian PIN code is rejected before any application is written.",
    experience: 1,
    address: "Probe",
    pincode: "110001",
    city_id: cities[0].id,
    area_id: null,
    service_area_ids: [],
    location_fallback: false,
    terms_accepted: true,
  },
});
if (!unsupportedSubmissionError) throw new Error("The secure submission function accepted an unsupported city/PIN mismatch.");

console.log(JSON.stringify({
  activeCities: cities.map((city) => city.name),
  strictCityOnly: settings.strict_city_only,
  pincodeSupported: pincode.supported,
  detectedCity: pincode.city?.name ?? pincode.detected?.city ?? pincode.detected?.district ?? null,
  unsupportedCityBlocked: true,
  anonymousMutationBlocked: true,
  directApplicationInsertBlocked: true,
  secureSubmissionValidationPassed: true,
}));
