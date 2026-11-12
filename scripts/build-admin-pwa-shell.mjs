import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function adminPwaShell(shell) {
  return shell
    .replace(/(<link[^>]*id="royallagn-pwa-manifest"[^>]*href=")[^"]+/, '$1/admin-manifest.webmanifest')
    .replace(/(<link[^>]*id="royallagn-apple-touch-icon"[^>]*href=")[^"]+/, '$1/admin-icon-192.png')
    .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]+/, '$1RL Admin')
    .replace(/(<meta name="theme-color" content=")[^"]+/, '$1#06234D')
    .replace(/(<meta name="robots" content=")[^"]+/, '$1noindex, nofollow')
    .replace(/(<link rel="canonical" href=")[^"]+/, '$1https://royallagn.com/AdminLogin')
    .replace(/<title>[^<]*<\/title>/, '<title>RoyalLagn Admin Portal</title>');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dist = resolve(process.argv[2] || 'dist');
  const shell = await readFile(resolve(dist, 'index.html'), 'utf8');
  const admin = adminPwaShell(shell);
  if (!admin.includes('href="/admin-manifest.webmanifest"') || !admin.includes('content="RL Admin"')) {
    throw new Error('Admin PWA shell metadata is missing; refusing to generate a public install entry.');
  }
  await writeFile(resolve(dist, 'admin.html'), admin);
  console.log('Generated static Admin PWA shell with Admin install metadata.');
}
