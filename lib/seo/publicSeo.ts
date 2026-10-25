export const SITE_ORIGIN = "https://royallagn.com";
export const TAB_TITLE = "RoyalLagn";
export const INDEXABLE_ROBOTS = "index, follow, max-image-preview:large";
export const PRIVATE_ROBOTS = "noindex, nofollow";

export const CATEGORIES = [
  { slug: "venues", name: "Venues", description: "Banquets, lawns, resorts and more" },
  { slug: "caterers", name: "Caterers", description: "Delicious food for every celebration" },
  { slug: "photographers", name: "Photographers", description: "Capture your most special moments" },
  { slug: "decorators", name: "Decorators", description: "Beautiful setups for your celebrations" },
  { slug: "makeup-artists", name: "Makeup Artists", description: "Look your best on your big day" },
  { slug: "mehndi-artists", name: "Mehndi Artists", description: "Beautiful mehndi for your special day" },
  { slug: "djs", name: "DJs", description: "Music that makes your event unforgettable" },
  { slug: "bridal-wear", name: "Bridal Wear", description: "Exquisite outfits for beautiful brides" },
  { slug: "groom-wear", name: "Groom Wear", description: "Sherwanis, suits and more" },
  { slug: "jewellery-accessories", name: "Jewellery & Accessories", description: "Complete your look with perfect jewellery" },
  { slug: "pandits", name: "Pandits", description: "Experienced pandits for wedding ceremonies" },
  { slug: "invites-cards", name: "Invites & Cards", description: "Beautiful invitations for every celebration" },
  { slug: "pre-wedding-shoot", name: "Pre Wedding Shoot", description: "Capture memories before the big day" },
  { slug: "music-dance", name: "Music & Dance", description: "Music and entertainment for every occasion" },
  { slug: "live-orchestra-band", name: "Live Orchestra & Band", description: "Live music and wedding bands for every celebration" },
] as const;

const CATEGORY_SLUG_ALIASES: Record<string, string> = {
  venue: "venues",
  "wedding-hall": "venues",
  caterer: "caterers",
  catering: "caterers",
  photographer: "photographers",
  photography: "photographers",
  decorator: "decorators",
  decor: "decorators",
  "makeup-artist": "makeup-artists",
  makeup: "makeup-artists",
  "mehndi-artist": "mehndi-artists",
  "mehendi-artist": "mehndi-artists",
  dj: "djs",
  "bridal-outfit": "bridal-wear",
  "groom-outfit": "groom-wear",
  jewellery: "jewellery-accessories",
  jewelry: "jewellery-accessories",
  pandit: "pandits",
  invites: "invites-cards",
  "pre-wedding-shoots": "pre-wedding-shoot",
  "music-and-dance": "music-dance",
};

/**
 * Prefix match, case-sensitive. `/vendor/` profiles are public and must stay
 * out of this list. `/Vendor...` is the private vendor workspace.
 */
export const PRIVATE_PREFIXES = [
  "/Admin",
  "/admin-",
  "/Crm",
  "/DashboardCenter",
  "/Vendor",
  "/vendor-",
  "/vendors",
  "/payments-admin",
  "/subscriptions-admin",
  "/Login",
  "/ForgotPassword",
  "/CreatePassword",
  "/OtpVerification",
  "/PasswordUpdated",
  "/Settings",
  "/EditProfile",
  "/Notifications",
  "/account-deletion",
  "/ticket",
  "/bookings",
  "/favorites",
  "/profile",
  "/referral",
  "/enquiry",
  "/team",
  "/TeamPortal",
];

export type SeoVendor = {
  slug: string;
  name: string;
  description: string;
  city: string;
  category: string;
  updatedAt?: string | null;
  image?: string | null;
};

export type SeoLink = { href: string; label: string };

export type SeoPage = {
  path: string;
  description: string;
  ogTitle: string;
  heading: string;
  paragraphs: string[];
  links: SeoLink[];
  jsonLd: Record<string, unknown>;
  robots: string;
  ogType: string;
  ogImage?: string;
  lastmod?: string;
};

type StaticCopy = {
  path: string;
  description: string;
  ogTitle: string;
  heading: string;
  body: string;
};

const STATIC_COPY: StaticCopy[] = [
  {
    path: "/",
    description: "Discover trusted wedding photographers, venues, decorators, makeup artists and more with RoyalLagn. Explore verified wedding vendors and send enquiries directly.",
    ogTitle: "RoyalLagn | Discover Trusted Wedding Vendors",
    heading: "Find your perfect wedding team",
    body: "Explore handpicked wedding professionals to make your big day unforgettable.",
  },
  {
    path: "/Categories",
    description: "Browse RoyalLagn wedding categories including venues, photographers, caterers, decorators, makeup artists and more.",
    ogTitle: "Wedding categories on RoyalLagn",
    heading: "Wedding categories",
    body: "Browse venues, photographers, caterers, decorators, makeup artists and every other wedding service on RoyalLagn.",
  },
  {
    path: "/NearbyVendors",
    description: "Find verified wedding vendors near you on RoyalLagn.",
    ogTitle: "Wedding vendors near you",
    heading: "Wedding vendors near you",
    body: "See verified wedding professionals serving your area on RoyalLagn.",
  },
  {
    path: "/Search",
    description: "Search verified wedding vendors, categories and services on RoyalLagn.",
    ogTitle: "Search wedding vendors",
    heading: "Search wedding vendors",
    body: "Search photographers, venues, decorators, makeup artists and other wedding services on RoyalLagn.",
  },
  {
    path: "/BecomeVendor",
    description: "List your wedding business on RoyalLagn and receive enquiries from couples.",
    ogTitle: "List your wedding business on RoyalLagn",
    heading: "List your business",
    body: "Join RoyalLagn as a verified wedding vendor and receive enquiries directly from couples.",
  },
  {
    path: "/Help",
    description: "Get help using RoyalLagn to find wedding vendors or manage your vendor account.",
    ogTitle: "RoyalLagn Help Center",
    heading: "Help Center",
    body: "Find answers and contact RoyalLagn support.",
  },
  {
    path: "/Terms",
    description: "Read the RoyalLagn terms and conditions for couples and wedding vendors.",
    ogTitle: "RoyalLagn terms and conditions",
    heading: "Terms and conditions",
    body: "The terms that apply when you use RoyalLagn to discover vendors or list a wedding business.",
  },
  {
    path: "/PrivacyPolicy",
    description: "Read how RoyalLagn collects, uses and protects personal information.",
    ogTitle: "RoyalLagn privacy policy",
    heading: "Privacy policy",
    body: "How RoyalLagn handles personal information for customers and vendors.",
  },
  {
    path: "/About",
    description: "RoyalLagn helps couples discover trusted wedding vendors and contact them directly.",
    ogTitle: "About RoyalLagn",
    heading: "About RoyalLagn",
    body: "RoyalLagn helps couples discover trusted wedding professionals across venues, photography, catering, decor and styling.",
  },
];

export function slugify(value: string) {
  return value.trim().toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function categoryRouteSlug(value: string) {
  const slug = slugify(value);
  return CATEGORY_SLUG_ALIASES[slug] ?? slug;
}

export function normalizePath(pathname: string) {
  const bare = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if (bare.length > 1 && bare.endsWith("/")) return bare.slice(0, -1);
  return bare || "/";
}

export function canonicalUrl(path: string) {
  const normalized = normalizePath(path);
  return normalized === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${normalized}`;
}

export function isVendorProfilePath(pathname: string) {
  return /^\/vendor\/[^/]+$/.test(normalizePath(pathname));
}

export function isListingPath(pathname: string) {
  return /^\/wedding-[a-z0-9-]+(?:\/[a-z0-9-]+)?$/.test(normalizePath(pathname));
}

export function isPrivatePath(pathname: string) {
  const path = normalizePath(pathname);
  if (path === "/" || isVendorProfilePath(path)) return false;
  return PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

export function staticPageForPath(pathname: string) {
  const path = normalizePath(pathname);
  return STATIC_COPY.find((page) => page.path === path) ?? null;
}

export function metaDescription(value: string, fallback: string) {
  const text = value.replace(/\s+/g, " ").trim() || fallback;
  if (text.length <= 160) return text;
  const clipped = text.slice(0, 157).replace(/\s+\S*$/, "").trim();
  return `${clipped || text.slice(0, 157).trim()}...`;
}

function categoryBySlug(slug: string) {
  return CATEGORIES.find((category) => category.slug === slug) ?? null;
}

function listingHeading(categoryName: string, city?: string) {
  return city ? `Wedding ${categoryName} in ${city}` : `Wedding ${categoryName}`;
}

function listingDescription(categoryName: string, city?: string) {
  return city
    ? `Discover verified wedding ${categoryName.toLowerCase()} in ${city} on RoyalLagn.`
    : `Discover verified wedding ${categoryName.toLowerCase()} on RoyalLagn.`;
}

function absoluteLinks(links: SeoLink[]) {
  return links.map((link) => ({
    href: link.href.startsWith("http") ? link.href : canonicalUrl(link.href),
    label: link.label,
  }));
}

function pageShell(input: {
  path: string;
  description: string;
  ogTitle: string;
  heading: string;
  paragraphs: string[];
  links: SeoLink[];
  jsonLd: Record<string, unknown>;
  ogType?: string;
  ogImage?: string;
  lastmod?: string;
}): SeoPage {
  return {
    path: normalizePath(input.path),
    description: metaDescription(input.description, input.description),
    ogTitle: input.ogTitle,
    heading: input.heading,
    paragraphs: input.paragraphs,
    links: absoluteLinks(input.links).slice(0, 80),
    jsonLd: input.jsonLd,
    robots: INDEXABLE_ROBOTS,
    ogType: input.ogType ?? "website",
    ogImage: input.ogImage,
    lastmod: input.lastmod,
  };
}

function safeVendorSlug(slug: string) {
  const trimmed = slug.trim();
  if (!trimmed || trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) return "";
  return trimmed;
}

export function buildSeoPages(vendors: SeoVendor[]): SeoPage[] {
  const usable = vendors.flatMap((vendor) => {
    const slug = safeVendorSlug(vendor.slug);
    const categorySlug = categoryRouteSlug(vendor.category || "");
    if (!slug || !categoryBySlug(categorySlug)) return [];
    return [{
      ...vendor,
      slug,
      categorySlug,
      citySlug: vendor.city.trim() ? slugify(vendor.city) : "",
      image: vendor.image?.startsWith("https://") ? vendor.image : undefined,
    }];
  });

  const categoryLinks = CATEGORIES.map((category) => ({
    href: `/wedding-${category.slug}`,
    label: `Wedding ${category.name}`,
  }));
  const vendorLinks = usable.map((vendor) => ({
    href: `/vendor/${encodeURIComponent(vendor.slug)}`,
    label: vendor.name,
  }));

  const staticPages = STATIC_COPY.map((copy) => pageShell({
    path: copy.path,
    description: copy.description,
    ogTitle: copy.ogTitle,
    heading: copy.heading,
    paragraphs: [copy.body],
    links: copy.path === "/" ? [...categoryLinks, ...vendorLinks] : categoryLinks,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": copy.path === "/" ? "WebPage" : "WebPage",
      name: copy.heading,
      description: copy.description,
      url: canonicalUrl(copy.path),
      isPartOf: { "@type": "WebSite", name: "RoyalLagn", url: `${SITE_ORIGIN}/` },
    },
  }));

  const categoryPages = CATEGORIES.map((category) => {
    const matches = usable.filter((vendor) => vendor.categorySlug === category.slug);
    const path = `/wedding-${category.slug}`;
    const description = listingDescription(category.name);
    return pageShell({
      path,
      description,
      ogTitle: listingHeading(category.name),
      heading: listingHeading(category.name),
      paragraphs: [`${category.description}. ${description}`],
      links: [
        ...matches.map((vendor) => ({ href: `/vendor/${encodeURIComponent(vendor.slug)}`, label: vendor.name })),
        ...categoryLinks,
      ],
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: listingHeading(category.name),
        description,
        url: canonicalUrl(path),
        isPartOf: { "@type": "WebSite", name: "RoyalLagn", url: `${SITE_ORIGIN}/` },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: matches.slice(0, 50).map((vendor, index) => ({
            "@type": "ListItem",
            position: index + 1,
            url: canonicalUrl(`/vendor/${encodeURIComponent(vendor.slug)}`),
            name: vendor.name,
          })),
        },
      },
    });
  });

  const cityKeys = new Set<string>();
  const cityPages: SeoPage[] = [];
  for (const vendor of usable) {
    if (!vendor.citySlug) continue;
    const key = `${vendor.categorySlug}/${vendor.citySlug}`;
    if (cityKeys.has(key)) continue;
    cityKeys.add(key);
    const category = categoryBySlug(vendor.categorySlug);
    if (!category) continue;
    const cityName = vendor.city.trim();
    const matches = usable.filter((item) => item.categorySlug === vendor.categorySlug && item.citySlug === vendor.citySlug);
    const path = `/wedding-${category.slug}/${vendor.citySlug}`;
    const description = listingDescription(category.name, cityName);
    cityPages.push(pageShell({
      path,
      description,
      ogTitle: listingHeading(category.name, cityName),
      heading: listingHeading(category.name, cityName),
      paragraphs: [description],
      links: matches.map((item) => ({ href: `/vendor/${encodeURIComponent(item.slug)}`, label: item.name })),
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: listingHeading(category.name, cityName),
        description,
        url: canonicalUrl(path),
        about: cityName,
        isPartOf: { "@type": "WebSite", name: "RoyalLagn", url: `${SITE_ORIGIN}/` },
      },
    }));
  }

  const vendorPages = usable.map((vendor) => {
    const category = categoryBySlug(vendor.categorySlug);
    const categoryName = category?.name ?? vendor.category;
    const path = `/vendor/${encodeURIComponent(vendor.slug)}`;
    const fallback = `${vendor.name} is a wedding ${categoryName.toLowerCase()}${vendor.city.trim() ? ` in ${vendor.city.trim()}` : ""} on RoyalLagn.`;
    const description = metaDescription(vendor.description, fallback);
    const lastmod = vendor.updatedAt ? new Date(vendor.updatedAt).toISOString().slice(0, 10) : undefined;
    return pageShell({
      path,
      description,
      ogTitle: vendor.name,
      heading: vendor.name,
      paragraphs: [description, `${categoryName}${vendor.city.trim() ? ` · ${vendor.city.trim()}` : ""}`],
      links: [
        { href: `/wedding-${vendor.categorySlug}`, label: `More wedding ${categoryName}` },
        ...(vendor.citySlug ? [{ href: `/wedding-${vendor.categorySlug}/${vendor.citySlug}`, label: `${categoryName} in ${vendor.city.trim()}` }] : []),
        { href: "/", label: "RoyalLagn home" },
      ],
      ogType: "business.business",
      ogImage: vendor.image,
      lastmod: Number.isNaN(Date.parse(vendor.updatedAt ?? "")) ? undefined : lastmod,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: vendor.name,
        description,
        url: canonicalUrl(path),
        image: vendor.image,
        address: vendor.city.trim() ? { "@type": "PostalAddress", addressLocality: vendor.city.trim(), addressCountry: "IN" } : undefined,
        areaServed: vendor.city.trim() || undefined,
      },
    });
  });

  return [...staticPages, ...categoryPages, ...cityPages, ...vendorPages];
}

export function robotsTxt() {
  const lines = [
    "User-agent: *",
    "Allow: /",
    "Allow: /vendor/",
    "Allow: /wedding-",
    ...PRIVATE_PREFIXES.map((prefix) => `Disallow: ${prefix}`),
    "",
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    "",
  ];
  return lines.join("\n");
}

export function sitemapXml(pages: SeoPage[]) {
  const urls = pages.map((page) => {
    const loc = xmlEscape(canonicalUrl(page.path));
    const lastmod = page.lastmod && /^\d{4}-\d{2}-\d{2}$/.test(page.lastmod) ? `\n    <lastmod>${page.lastmod}</lastmod>` : "";
    return `  <url>\n    <loc>${loc}</loc>${lastmod}\n  </url>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function xmlEscape(value: string) {
  return value.replace(/[<>&'"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character] ?? character);
}

function escapeAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SNAPSHOT_STYLE = `<style id="royallagn-crawl-style">.rl-seo-snapshot{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important}</style>`;

function snapshotHtml(page: SeoPage) {
  const paragraphs = page.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  const links = page.links.map((link) => `<li><a href="${escapeAttr(link.href)}">${escapeHtml(link.label)}</a></li>`).join("");
  return `<main id="royallagn-crawl-snapshot" class="rl-seo-snapshot" aria-hidden="true"><h1>${escapeHtml(page.heading)}</h1>${paragraphs}<nav aria-label="Related RoyalLagn pages"><ul>${links}</ul></nav></main>`;
}

function upsertMeta(html: string, attr: "name" | "property", key: string, content: string) {
  const tag = `<meta ${attr}="${key}" content="${escapeAttr(content)}" />`;
  const pattern = new RegExp(`<meta\\s+${attr}=["']${escapeRegExp(key)}["'][^>]*>`, "gi");
  if (!pattern.test(html)) return html.replace("</head>", `${tag}\n</head>`);
  pattern.lastIndex = 0;
  let replaced = false;
  return html.replace(pattern, () => {
    if (replaced) return "";
    replaced = true;
    return tag;
  });
}

function upsertCanonical(html: string, href: string) {
  const tag = `<link rel="canonical" href="${escapeAttr(href)}" />`;
  const pattern = /<link\s+rel=["']canonical["'][^>]*>/gi;
  if (!pattern.test(html)) return html.replace("</head>", `${tag}\n</head>`);
  pattern.lastIndex = 0;
  let replaced = false;
  return html.replace(pattern, () => {
    if (replaced) return "";
    replaced = true;
    return tag;
  });
}

function rootAbsoluteAssets(html: string) {
  return html
    .replace(/(\s(?:src|href)=["'])\.\//gi, "$1/")
    .replace(/(\s(?:src|href)=["'])(?!\/|https?:|#|data:|mailto:)([^"']+)/gi, "$1/$2");
}

/** Injects page metadata into an Expo web shell without changing the app bundle. */
export function applySeoToHtml(shell: string, page: SeoPage) {
  let html = rootAbsoluteAssets(shell);
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${TAB_TITLE}</title>`);
  html = upsertMeta(html, "name", "description", page.description);
  html = upsertMeta(html, "name", "robots", page.robots);
  html = upsertMeta(html, "property", "og:site_name", "RoyalLagn");
  html = upsertMeta(html, "property", "og:title", page.ogTitle);
  html = upsertMeta(html, "property", "og:description", page.description);
  html = upsertMeta(html, "property", "og:url", canonicalUrl(page.path));
  html = upsertMeta(html, "property", "og:type", page.ogType);
  if (page.ogImage) html = upsertMeta(html, "property", "og:image", page.ogImage);
  html = upsertMeta(html, "name", "twitter:card", page.ogImage ? "summary_large_image" : "summary");
  html = upsertMeta(html, "name", "twitter:title", page.ogTitle);
  html = upsertMeta(html, "name", "twitter:description", page.description);
  html = upsertCanonical(html, canonicalUrl(page.path));
  html = html.replace(/<script id="royallagn-jsonld"[\s\S]*?<\/script>/i, "");
  const json = JSON.stringify(page.jsonLd).replace(/</g, "\\u003c");
  html = html.replace("</head>", `<script id="royallagn-jsonld" type="application/ld+json">${json}</script>\n</head>`);
  html = html.replace(/<style id="royallagn-crawl-style">[\s\S]*?<\/style>/i, "");
  html = html.replace("</head>", `${SNAPSHOT_STYLE}\n</head>`);
  html = html.replace(/<main id="royallagn-crawl-snapshot"[\s\S]*?<\/main>/i, "");
  if (!html.includes('<div id="root">') && !html.includes('<div id="root"')) {
    throw new Error("Expo web shell is missing #root, so crawlable HTML cannot be attached safely.");
  }
  return html.replace(/<div id="root"/i, `${snapshotHtml(page)}<div id="root"`);
}
