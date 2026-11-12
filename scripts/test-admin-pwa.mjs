import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { adminPwaShell } from './build-admin-pwa-shell.mjs';
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const install = await readFile(new URL('../public/admin-install.html', import.meta.url), 'utf8');
const control = await readFile(new URL('../components/admin/AdminPwaInstallControl.tsx', import.meta.url), 'utf8');
const admin = adminPwaShell(html);
const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('../public/admin-manifest.webmanifest', import.meta.url), 'utf8'));
const source = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match => match[1]).find(script => script.includes('syncPwaMetadata'));
const rewrite = config.rewrites.find(route => route.destination === '/admin.html');
const matcher = new RegExp(`^${rewrite.source}$`);
for (const path of ['/AdminLogin', '/admin-dashboard', '/AdminProfile', '/VendorApplications', '/VendorApplicationDetails', '/subscriptions-admin', '/payments-admin', '/vendors-admin-listing', '/team']) assert.ok(matcher.test(path), `Admin document must cover ${path}`);
for (const path of ['/', '/VendorGallery', '/vendor/photographer', '/Login', '/service-worker.js', '/admin-icon-192.png']) assert.ok(!matcher.test(path), `Admin rewrite must not intercept ${path}`);
assert.equal((admin.match(/rel="manifest"/g) || []).length, 1);
assert.match(admin, /id="royallagn-pwa-manifest" rel="manifest" href="\/admin-manifest.webmanifest"/);
assert.match(admin, /id="royallagn-apple-touch-icon" rel="apple-touch-icon" href="\/admin-icon-192.png"/);
assert.match(admin, /name="apple-mobile-web-app-title" content="RL Admin"/);
assert.match(admin, /name="robots" content="noindex, nofollow"/);
assert.equal(manifest.start_url, '/AdminLogin?source=pwa');
assert.equal((install.match(/rel="manifest"/g) || []).length, 1);
assert.match(install, /rel="manifest" href="\/admin-manifest.webmanifest"/);
assert.match(install, /rel="apple-touch-icon" href="\/admin-icon-192.png"/);
assert.doesNotMatch(control, /document\.createElement\("link"\)|register\("\/admin-service-worker/);
assert.match(control, /location\.assign\("\/admin-install\.html"\)/);

const nodes = {
  manifest: { href: '/manifest.webmanifest' }, icon: { href: '/icon-180.png' },
  theme: { content: '#E91E63' }, appleTitle: { content: 'RoyalLagn' },
  canonical: { href: 'https://royallagn.com/' },
};
const location = { pathname: '/', hostname: 'royallagn.com', origin: 'https://royallagn.com' };
const handlers = {};
const context = { location, navigator: {}, document: {
  getElementById: id => id.includes('manifest') ? nodes.manifest : nodes.icon,
  querySelector: selector => selector.includes('theme-color') ? nodes.theme : selector.includes('apple-mobile') ? nodes.appleTitle : nodes.canonical,
}, history: {
  pushState: (_, __, path) => { location.pathname = path; },
  replaceState: (_, __, path) => { location.pathname = path; },
}, Event: class { constructor(type) { this.type = type; } },
addEventListener: (name, fn) => { handlers[name] = fn; }, dispatchEvent: () => {} };
context.window = context;
vm.runInNewContext(source, context);
assert.equal(nodes.manifest.href, '/manifest.webmanifest');
for (const path of ['/AdminLogin', '/admin-dashboard', '/VendorApplicationDetails', '/payments-admin', '/team']) {
  context.history.pushState({}, '', path);
  assert.equal(nodes.manifest.href, '/admin-manifest.webmanifest');
  assert.equal(nodes.icon.href, '/admin-icon-192.png');
  assert.equal(nodes.appleTitle.content, 'RL Admin');
  assert.equal(nodes.canonical.href, 'https://royallagn.com/AdminLogin');
}
context.history.replaceState({}, '', '/');
assert.equal(nodes.manifest.href, '/manifest.webmanifest');
assert.equal(nodes.icon.href, '/icon-180.png');
assert.equal(nodes.appleTitle.content, 'RoyalLagn');
assert.equal(nodes.canonical.href, 'https://royallagn.com/');
// The install page also handles older iOS bookmarks that launch the current URL.
const launchScript = install.match(/<script>([\s\S]*?)<\/script>/)[1];
for (const [standalone, media, expected] of [[false, false, null], [true, false, '/AdminLogin?source=pwa'], [false, true, '/AdminLogin?source=pwa']]) {
  let target = null;
  vm.runInNewContext(launchScript, { navigator: { standalone }, matchMedia: () => ({ matches: media }), location: { replace: value => { target = value; } } });
  assert.equal(target, expected);
}
console.log('Admin PWA: static metadata, route rewrites, single manifest/worker, public navigation and iOS launch fallback passed.');
