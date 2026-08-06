# AGENTS.md — RoyalLagn

Guidance for AI coding agents working in this repo. See [PRD.md](PRD.md) for product/feature context.

## Documentation Map

[PRD.md](PRD.md) and this file are the **single source of truth** for product scope and dev/agent conventions. Older planning docs (`RoyalLagn.prd`, `RoyalLagn.srs`, `replit.md`) were superseded and moved to [docs/archive/](docs/archive/) — a duplicate (`ShaadiVendors_PRD.md`, byte-identical to `RoyalLagn.prd`) was deleted outright. Do not resurrect or treat the archived docs as current; if you update product scope or conventions, update PRD.md/AGENTS.md directly instead of creating a new planning doc.

## Project Type

Expo (React Native + Web) app, file-based routing via Expo Router v6, backed by Supabase. One codebase serves three surfaces: **public customer app**, **vendor dashboard**, **admin dashboard** (see `app/` — filenames are prefixed `Admin*` / `Vendor*` or unprefixed for public).

## Setup & Run

```bash
npm install --legacy-peer-deps
npm run web        # web preview (expo start --web)
npm run start       # expo start (choose platform)
npm run android      # requires prebuilt android/ (npm run prebuild:android)
npm run ios          # requires ios/ workspace
```

Always keep `--legacy-peer-deps` — `lucide-react-native` has a peer conflict with React 19. Use the `Browser` preview tool (`.claude/launch.json`) instead of manually shelling out to a dev server.

On Replit specifically, the workflow entrypoint is `npm install --legacy-peer-deps --prefer-offline && npx expo start --web --port 5000 --host lan` (web preview served on port 5000).

## Before Editing

- Check `services/*.ts` for existing data-access patterns before writing new Supabase queries — most domains already have a service module (e.g. `vendorProfile.ts`, `publicVendorListings.ts`, `adminVendorService.ts`).
- Check `context/*.tsx` before introducing new global state — there is likely a context already covering that domain (auth per-role, favorites, categories, locations, notifications, subscriptions, reviews, responsive layout).
- Schema changes go in a new timestamped file under `supabase/migrations/` (format `YYYYMMDDHHMMSS_description.sql`) — never edit a past migration in place once it may have been applied.
- Cloudinary secrets (`CLOUDINARY_*`) are Supabase Edge Function secrets, not `EXPO_PUBLIC_` env vars — never move them into client-exposed config.

## Conventions

- Styling: NativeWind v4 (Tailwind classes via `className`). `babel.config.js` uses `jsxImportSource: 'nativewind'` — do not switch to the `nativewind/babel` plugin.
- `metro.config.js` has a deliberate `sourceExts` tweak for `cjs`/`mjs`; do not add a `blockList` for nested `node_modules` (breaks `@expo/metro-runtime`).
- Route files under `app/` map directly to URLs/screens (Expo Router convention) — one screen per file, `(tabs)/` is the bottom-tab group, `[slug].tsx` handles dynamic vendor profile routes.
- Three auth contexts exist in parallel (`PublicAuthContext`, `VendorSessionContext`, `AdminAuthContext`) — do not conflate them; each has its own login/OTP/session flow and Supabase RLS assumptions.
- `clips/` and `subscriptions/` and `locations/` are self-contained domain packages (own `types/`, `services/`, `utils/`) — prefer extending them over adding domain logic directly into `app/*.tsx` screens.
- react-native-web gaps are patched manually in this repo (e.g. `Alert`) — check `components/` for an existing shim before assuming a React Native API works unmodified on web.

## Testing

No Jest/Vitest configured. Use the existing smoke scripts before/after touching related domains:

```bash
npm run lint
npm run test:profile-smoke
npm run test:subscriptions
npm run test:packages
npm run test:contacts
npm run test:locations
```

`test:profile-e2e` needs staging credentials in `.env` and hits real Supabase — don't run it against production data without confirming with the user.

`test:profile-smoke` is currently broken (references a stale `app/VendorEditProfile.tsx` path that no longer exists post-refactor into `VendorEditBusinessInfo.tsx`/etc.) — known issue, not caused by your changes; fix `scripts/smoke-profile-propagation.mjs` if you touch that area, otherwise treat its failure as expected until fixed.

## Things to Avoid

- Don't hand-edit `android/` or `ios/` unless the change is already committed there — they're normally regenerated via `expo prebuild` and hand edits get silently lost on the next prebuild. Confirm with the user before treating them as source of truth.
- Don't add new top-level state management (Redux/Zustand/etc.) — this repo standardizes on React Context per domain.
- Don't introduce a different styling approach (styled-components, plain StyleSheet-only patterns) in new screens — match existing NativeWind usage.
- Don't commit real Supabase/Cloudinary/Razorpay credentials; `.env.example` documents the required keys.

## Where to Look First

| Need | Look at |
|---|---|
| Add/change a public screen | `app/*.tsx` (unprefixed), `app/(tabs)/` |
| Add/change vendor dashboard feature | `app/Vendor*.tsx`, `services/vendor*.ts`, `context/VendorSessionContext.tsx` |
| Add/change admin feature | `app/Admin*.tsx`, `services/admin*.ts`, `context/AdminAuthContext.tsx` |
| CRM (internal sales tool) | `app/AdminCrm*.tsx`, `app/CrmWorkspace*.tsx`, `services/crm/`, `types/crm/`, `hooks/crm/` |
| Clips (short video) | `clips/` package |
| Subscriptions/billing | `subscriptions/` package, `hooks/useSubscriptionAccess.ts` |
| Location data (state/district/taluka) | `locations/` package |
| DB schema | `supabase/migrations/` (append-only, newest last) |
| Media upload | `services/cloudinary.ts`, Edge Functions referenced in [README.md](README.md) |
