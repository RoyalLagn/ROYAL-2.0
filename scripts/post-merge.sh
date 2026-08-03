#!/usr/bin/env bash
# Runs automatically after a task branch is merged.
set -euo pipefail
cd "$(dirname "$0")/.."

# Install any new dependencies (non-interactive, fast when nothing changed)
npm install --legacy-peer-deps --prefer-offline --no-audit --no-fund

# Re-apply the Expo CLI patch (skips the interactive login prompt); idempotent
node scripts/patch-expo.js
