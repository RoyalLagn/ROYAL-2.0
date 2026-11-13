import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");
const shell = await read("public/index.html");
const script = [...shell.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .find((source) => source.includes("syncPwaMetadata"));
const events = {};
const nodes = {
  manifest: { href: "/manifest.webmanifest" },
  icon: {},
  theme: {},
  title: {},
  canonical: { href: "https://royallagn.com/" },
};
const location = {
  pathname: "/",
  origin: "https://royallagn.com",
  hostname: "royallagn.com",
};
const context = {
  location,
  navigator: {},
  document: {
    getElementById: (id) =>
      id.includes("manifest") ? nodes.manifest : nodes.icon,
    querySelector: (selector) =>
      selector.includes("theme-color")
        ? nodes.theme
        : selector.includes("apple-mobile")
          ? nodes.title
          : nodes.canonical,
  },
  history: {
    pushState: (_, __, path) => {
      location.pathname = path;
    },
    replaceState: (_, __, path) => {
      location.pathname = path;
    },
  },
  Event: class {
    constructor(type) {
      this.type = type;
    }
  },
  addEventListener: (type, fn) => {
    events[type] = fn;
  },
  dispatchEvent: (event) => {
    events[event.type]?.(event);
  },
};
context.window = context;
vm.runInNewContext(script, context);
for (const [path, role, manifest] of [
  ["/", "customer", "/manifest.webmanifest"],
  ["/profile", "customer", "/manifest.webmanifest"],
  ["/vendor-dashboard", "vendor", "/vendor-manifest.webmanifest"],
  ["/Vendors_dash_profile", "vendor", "/vendor-manifest.webmanifest"],
  ["/VendorGallery", "vendor", "/vendor-manifest.webmanifest"],
  ["/vendor/photographer", "customer", "/manifest.webmanifest"],
  ["/VendorsProfile", "customer", "/manifest.webmanifest"],
  ["/AdminLogin", "admin", "/admin-manifest.webmanifest"],
  ["/VendorApplications", "admin", "/admin-manifest.webmanifest"],
  ["/VendorApplicationDetails", "admin", "/admin-manifest.webmanifest"],
]) {
  context.history.pushState({}, "", path);
  assert.equal(nodes.manifest.href, manifest, path);
  let prevented = false;
  const event = {
    preventDefault: () => {
      prevented = true;
    },
  };
  events.beforeinstallprompt(event);
  assert.ok(prevented);
  if (role === "admin")
    assert.equal(context.__royalLagnAdminInstallPrompt, event);
  else {
    assert.equal(context.__royalLagnAppInstallPrompt.role, role);
    assert.equal(context.__royalLagnAppInstallPrompt.event, event);
  }
}
context.history.pushState({}, "", "/vendor-dashboard");
assert.equal(
  context.__royalLagnAdminInstallPrompt,
  null,
  "Do not reuse another role’s install prompt",
);
assert.equal(context.__royalLagnAppInstallPrompt, null);
for (const [file, manifestFile, start] of [
  ["install-app.html", "manifest.webmanifest", "/?source=pwa"],
  [
    "vendor-install.html",
    "vendor-manifest.webmanifest",
    "/vendor-dashboard?source=pwa",
  ],
]) {
  const html = await read(`public/${file}`);
  const manifest = JSON.parse(await read(`public/${manifestFile}`));
  assert.equal((html.match(/rel="manifest"/g) || []).length, 1);
  assert.ok(html.includes(`href="/${manifestFile}"`));
  assert.equal(manifest.start_url, start);
  assert.ok(html.includes(`data-launch-url="${start}"`));
  assert.doesNotMatch(html, /apps\.apple\.com|play\.google\.com|\.apk/);
}
const installScript = await read("public/app-install.js");
for (const launchUrl of ["/?source=pwa", "/vendor-dashboard?source=pwa"]) {
  let redirected = null;
  vm.runInNewContext(installScript, {
    document: { documentElement: { dataset: { launchUrl } } },
    navigator: { standalone: true },
    window: { matchMedia: () => ({ matches: false }) },
    location: {
      replace: (target) => {
        redirected = target;
      },
    },
  });
  assert.equal(redirected, launchUrl);
}
console.log(
  "App install checks passed: role-specific prompts/manifests, public/Admin isolation and standalone launch URLs.",
);
