---
name: Expo dev server on Replit (web + Expo Go)
description: How to configure expo start so both the Replit web preview and Expo Go QR scanning work
---

# Expo dev server on Replit

Working workflow command:
```
npm install --legacy-peer-deps --prefer-offline && node scripts/patch-expo.js && EXPO_PACKAGER_PROXY_URL=https://$REPLIT_EXPO_DEV_DOMAIN npx expo start --web --port 5000 --host localhost --clear
```

**Rules:**
- Web preview: Metro must serve on `localhost:5000`; Replit's standard proxy maps the dev domain (443) → localhost:5000. Never rely on `--host lan`.
- Expo Go (phone): use `EXPO_PACKAGER_PROXY_URL=https://$REPLIT_EXPO_DEV_DOMAIN`. This makes the QR URL `exp://<expo-domain>` on port 443, which Replit's Expo proxy accepts.
- **Never** use `REACT_NATIVE_PACKAGER_HOSTNAME=$REPLIT_EXPO_DEV_DOMAIN`: it appends `:5000` to the QR URL — the Expo proxy rejects explicit :5000 (HTTP 400) → Expo Go shows "Packager is not running".
- `scripts/patch-expo.js` must run after every npm install: it patches `@expo/cli` to skip the interactive login prompt (marker `REPLIT_PATCH`). Without it the server blocks on a prompt; with `CI=1` instead, hot reload dies.
- A poisoned Metro cache (e.g. from a build with merge-conflict markers) causes phantom "Unable to resolve" errors for files that exist — fix with `--clear`. `--clear` can be dropped once stable (costs ~20–30s per restart).

**Why:** Replit's `*.expo.sisko.replit.dev` domain proxies only HTTPS/443 → container port; explicit ports in URLs fail. The plain dev domain proxies the web preview the same way.
