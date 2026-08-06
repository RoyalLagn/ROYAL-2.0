# RoyalLagn

A wedding vendor marketplace mobile/web app built with Expo + React Native and NativeWind v4 styling. Customers can browse vendors by category (Venues, Caterers, Photographers, etc.), make bookings, save favorites, and manage their profile. Admin and Vendor dashboards are also included.

## Tech Stack

- **Framework**: Expo SDK 54 / React Native 0.81
- **Routing**: Expo Router v6 (file-based)
- **Styling**: NativeWind v4 (Tailwind CSS for React Native)
- **Animations**: react-native-reanimated
- **Icons**: lucide-react-native (+ react-native-svg)
- **Package Manager**: npm (with `--legacy-peer-deps` via `.npmrc` due to lucide-react-native peer dep)

## Running Locally

The workflow `Start application` runs:
```
npm install --legacy-peer-deps --prefer-offline && npx expo start --web --port 5000 --host lan
```

The app is served at port 5000 (web preview).

## Project Structure

```
app/
  _layout.tsx              # Root layout (ThemeProvider, SafeAreaProvider)
  (tabs)/
    _layout.tsx            # Bottom tab navigation
    index.tsx              # Home screen
    search.tsx             # Search screen
    bookings.tsx           # Bookings screen
    favorites.tsx          # Favorites screen
    profile.tsx            # Profile screen
  admin-dashboard.tsx      # Admin dashboard
  vendor-dashboard.tsx     # Vendor dashboard
  payments-admin.tsx       # Admin payments view
  subscriptions-admin.tsx  # Admin subscriptions view
  vendors-admin-listing.tsx
  VendorsListing.tsx
  VendorsProfile.tsx
components/
  ThemeProvider.tsx        # Dark/light theme context
  ThemeToggle.tsx          # Theme toggle button
  AdminFooter.tsx
lib/
  cva.ts                   # Class Variance Authority utility

## Key Config Files

- `babel.config.js` — NativeWind v4 uses `jsxImportSource: 'nativewind'` in preset (NOT the `nativewind/babel` plugin)
- `metro.config.js` — Added `cjs`/`mjs` to sourceExts to fix nanoid/non-secure resolution. Do NOT add a blockList for nested node_modules — it breaks resolution of `@expo/metro`'s nested metro-runtime.
- `tailwind.config.js` — Tailwind theme with custom pink/mauve palette
- `global.css` — NativeWind global CSS entry
- `app.json` — sole Expo config (no app.config.js); `newArchEnabled: true` (required by reanimated v4 + worklets); light theme

## Local APK Build

The project is set up for local Android builds (see `BUILD.md`):
- `android/` and `ios/` are NOT committed — generated via `npx expo prebuild`
- One-command build: `setup.ps1` (PowerShell) or `setup.bat` (CMD)
- Scripts: `npm run prebuild:android`, `npm run build:apk`
- All dependency versions aligned to Expo SDK 54 via `expo install --fix`
- Unused packages removed (react-router, react-aria, @legendapp/motion, react-native-gifted-charts, date-fns, webview, etc.)

## User Preferences

- Keep `--legacy-peer-deps` for npm installs (lucide-react-native peer dep conflict with React 19)
