#!/usr/bin/env node
/**
 * Patches @expo/cli to automatically proceed anonymously when not logged in,
 * instead of showing an interactive prompt that blocks Expo Go native connections.
 *
 * Hot reload and QR codes remain fully functional (no CI mode needed).
 */

const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname,
  '..',
  'node_modules',
  '@expo',
  'cli',
  'build',
  'src',
  'api',
  'user',
  'actions.js'
);

let content;
try {
  content = fs.readFileSync(file, 'utf8');
} catch {
  console.log('⚠️  Could not read Expo CLI actions.js — skipping patch');
  process.exit(0);
}

if (content.includes('REPLIT_PATCH')) {
  console.log('✓ Expo already patched (auto-proceed anonymously)');
  process.exit(0);
}

// Replace the interactive "Log in / Proceed anonymously" prompt block with
// a direct return null (= proceed anonymously) so Expo never blocks on input.
const OLD = `    const choices = [
        {
            title: 'Log in',
            value: true
        },
        {
            title: 'Proceed anonymously',
            value: false
        }
    ];
    const value = await (0, _prompts.selectAsync)((0, _chalk().default)\`\\n\\nIt is recommended to log in with your Expo account before proceeding. \\n{dim \${(0, _link.learnMore)('https://expo.fyi/unverified-app-expo-go')}}\\n\`, choices, {
        nonInteractiveHelp: \`Use the EXPO_TOKEN environment variable to authenticate in CI (\${(0, _link.learnMore)('https://docs.expo.dev/accounts/programmatic-access/')})\`
    });
    if (value) {
        await showLoginPromptAsync({
            printNewLine: true
        });
        return await (0, _user.getUserAsync)() ?? null;
    }
    return null;`;

const NEW = `    // REPLIT_PATCH: auto-proceed anonymously — no interactive prompt needed
    return null;`;

if (!content.includes(OLD.slice(0, 40))) {
  console.log('ℹ️  Patch target not found — Expo CLI may have already been updated or patched differently. Continuing.');
  process.exit(0);
}

content = content.replace(OLD, NEW);
fs.writeFileSync(file, content);
console.log('✓ Patched Expo CLI: auto-proceed anonymously (no prompt, no CI mode)');
