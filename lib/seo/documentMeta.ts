import {
  INDEXABLE_ROBOTS,
  PRIVATE_ROBOTS,
  TAB_TITLE,
  canonicalUrl,
  isListingPath,
  isPrivatePath,
  isVendorProfilePath,
  normalizePath,
  staticPageForPath,
  type SeoPage,
} from "@/lib/seo/publicSeo";

function setMeta(attr: "name" | "property", key: string, content: string) {
  let tag = document.querySelector(`meta[${attr}="${key}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setCanonical(href: string) {
  let tag = document.querySelector('link[rel="canonical"]');
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", "canonical");
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
}

function setJsonLd(data: Record<string, unknown>) {
  let tag = document.getElementById("royallagn-jsonld");
  if (!tag) {
    tag = document.createElement("script");
    tag.id = "royallagn-jsonld";
    tag.setAttribute("type", "application/ld+json");
    document.head.appendChild(tag);
  }
  tag.textContent = JSON.stringify(data);
}

export function applyWebDocumentMeta(page: Pick<SeoPage, "path" | "description" | "ogTitle" | "robots" | "ogType" | "jsonLd"> & { ogImage?: string }) {
  if (typeof document === "undefined") return;
  const url = canonicalUrl(page.path);
  document.title = TAB_TITLE;
  setMeta("name", "description", page.description);
  setMeta("name", "robots", page.robots);
  setMeta("property", "og:site_name", "RoyalLagn");
  setMeta("property", "og:title", page.ogTitle);
  setMeta("property", "og:description", page.description);
  setMeta("property", "og:url", url);
  setMeta("property", "og:type", page.ogType);
  if (page.ogImage) setMeta("property", "og:image", page.ogImage);
  setMeta("name", "twitter:card", page.ogImage ? "summary_large_image" : "summary");
  setMeta("name", "twitter:title", page.ogTitle);
  setMeta("name", "twitter:description", page.description);
  setCanonical(url);
  setJsonLd(page.jsonLd);
}

function currentCanonical() {
  return document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? "";
}

/**
 * Keeps the browser tab on RoyalLagn and refreshes head tags after client
 * navigations. Vendor and listing screens own their detailed tags once they
 * have data, so this does not overwrite a canonical they already set.
 */
export function syncPublicDocument(pathname: string, searchQuery = "") {
  if (typeof document === "undefined") return;
  const path = normalizePath(pathname || "/");
  document.title = TAB_TITLE;

  if (isPrivatePath(path) || (path === "/Search" && searchQuery.trim())) {
    applyWebDocumentMeta({
      path,
      description: "This RoyalLagn page is not part of the public marketplace.",
      ogTitle: TAB_TITLE,
      robots: PRIVATE_ROBOTS,
      ogType: "website",
      jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: TAB_TITLE, url: canonicalUrl(path) },
    });
    return;
  }

  if (isVendorProfilePath(path) || isListingPath(path)) {
    setMeta("name", "robots", INDEXABLE_ROBOTS);
    if (currentCanonical() !== canonicalUrl(path)) {
      const label = isVendorProfilePath(path) ? "Wedding vendor profile" : "Wedding vendors";
      applyWebDocumentMeta({
        path,
        description: `${label} on RoyalLagn.`,
        ogTitle: TAB_TITLE,
        robots: INDEXABLE_ROBOTS,
        ogType: isVendorProfilePath(path) ? "business.business" : "website",
        jsonLd: {
          "@context": "https://schema.org",
          "@type": isVendorProfilePath(path) ? "LocalBusiness" : "CollectionPage",
          name: label,
          url: canonicalUrl(path),
        },
      });
    }
    document.title = TAB_TITLE;
    return;
  }

  const page = staticPageForPath(path);
  if (!page) {
    applyWebDocumentMeta({
      path,
      description: "This RoyalLagn page could not be found.",
      ogTitle: TAB_TITLE,
      robots: PRIVATE_ROBOTS,
      ogType: "website",
      jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: TAB_TITLE, url: canonicalUrl(path) },
    });
    return;
  }

  applyWebDocumentMeta({
    path: page.path,
    description: page.description,
    ogTitle: page.ogTitle,
    robots: INDEXABLE_ROBOTS,
    ogType: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: page.heading,
      description: page.description,
      url: canonicalUrl(page.path),
      isPartOf: { "@type": "WebSite", name: "RoyalLagn", url: `${canonicalUrl("/")}` },
    },
  });
}
