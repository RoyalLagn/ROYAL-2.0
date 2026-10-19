import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execSync } from "node:child_process";

// Always anchor to the true repository root regardless of where Vercel or npm spawns the process
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(rootDir);

console.log(`[build-web] Building RoyalLagn Expo Web SPA from root: ${rootDir}`);

// 1. Generate SEO sitemap
console.log("[build-web] Generating sitemap...");
execSync("node scripts/generate-sitemap.mjs", {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env,
});

// 2. Export Expo React Native Web application
console.log("[build-web] Running Expo web export...");
execSync(`npx expo export "${rootDir}" -p web`, {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env,
});

console.log("[build-web] Production build completed successfully.");
