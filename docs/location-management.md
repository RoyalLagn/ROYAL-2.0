# RoyalLagn managed locations

RoyalLagn locations are now database records rather than client constants. The source of truth is:

- `supported_cities`
- `supported_areas`
- `supported_pincodes`
- `vendor_service_locations`
- customer preferences on `profiles.preferred_city_id` and `profiles.preferred_area_id`
- `location_settings.strict_city_only`

The initial Pune, Mumbai, Lonavala and Nashik records were migrated from the previous hardcoded list. Administrators can manage them from `/AdminLocations`.

## PIN provider

`lookup-india-pincode` first uses a verified Supabase cache. It then uses the Government of India data.gov.in provider when `DATA_GOV_IN_API_KEY` and `DATA_GOV_IN_PINCODE_RESOURCE_ID` are configured. The official directory is documented at:

https://www.data.gov.in/catalog/all-india-pincode-directory-through-webservice

When those variables are absent, the modular fallback uses `PINCODE_API_BASE_URL`. The default fallback is the no-key `postalpincode.in` API. A supported provider result is cached in `supported_pincodes`.

If the provider is unavailable, the vendor form allows manual selection only from active admin-managed cities and areas. A successful provider response for an unsupported city never enables the fallback.

## Secure Vendor application flow

Direct public inserts into `vendor_applications` are revoked. `submit-vendor-application` validates the category, active city, active areas, PIN/provider match, duplicate pending application and required fields before it writes with the service role. Client code cannot approve a city or create a location.

## Deployment

```sh
supabase db push --linked
supabase functions deploy lookup-india-pincode --no-verify-jwt --use-api
supabase functions deploy submit-vendor-application --no-verify-jwt --use-api
```

Optional Edge Function secrets:

```text
DATA_GOV_IN_API_KEY
DATA_GOV_IN_PINCODE_RESOURCE_ID
PINCODE_API_BASE_URL
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the Supabase Edge Function environment and must never be exposed in Expo client variables.

## Verification

```sh
npm run test:locations
npx tsc --noEmit
npm run lint
node --env-file=.env scripts/smoke-location-remote.mjs
```

The remote smoke test reads active locations, tests a supported Pune PIN, rejects an unsupported Delhi PIN, confirms anonymous location writes are blocked, confirms direct Vendor-application inserts are blocked and verifies the secure submission function rejects a city/PIN mismatch without creating an application.

