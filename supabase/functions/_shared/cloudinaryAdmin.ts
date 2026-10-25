import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const CLOUDINARY_HOST = /^res\.cloudinary\.com$/i;

/** Prevent replacements or draft cleanup from removing a shared/saved asset. */
export async function assertMediaUnreferenced(url: string) {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const columns: [string, string][] = [
    ["hero_slides", "image_url"], ["hero_slides", "desktop_image_url"],
    ["categories", "icon_url"], ["categories", "fallback_image_url"], ["categories", "home_image_url"],
    ["profiles", "profile_image"], ["vendors", "logo_url"],
    ["vendor_applications", "logo_url"], ["vendor_applications", "cover_image_url"],
    ["vendor_portfolio_media", "secure_url"],
  ];
  const results = await Promise.all([
    ...columns.map(([table, column]) => db.from(table).select("id").eq(column, url).limit(1)),
    db.from("reviews").select("id").contains("image_urls", [url]).limit(1),
    db.from("vendor_applications").select("id").contains("business_documents", JSON.stringify([{url}])).limit(1),
  ]);
  for (const [index, result] of results.entries()) {
    if (result.error) throw new Error(`Unable to verify media references (${index}): ${result.error.message}; asset preserved`);
    if (result.data?.length) throw new Error("Media is still referenced by a saved record; asset preserved");
  }
}

export async function sha1Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function extractCloudinaryPublicId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const cloud = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    if (parsed.protocol !== "https:" || !CLOUDINARY_HOST.test(parsed.hostname)
      || !cloud || parsed.pathname.split("/")[1] !== cloud) return null;
    const pathname = parsed.pathname;
    const uploadIndex = pathname.indexOf("/upload/");
    if (uploadIndex === -1) return null;
    const pathAfterUpload = pathname.slice(uploadIndex + "/upload/".length);
    const segments = pathAfterUpload.split("/").filter(Boolean);
    const versionIndex = segments.findIndex((seg) => /^v\d+$/.test(seg));
    const assetSegments = versionIndex !== -1
      ? segments.slice(versionIndex + 1)
      : segments.filter((segment) => !segment.includes(",") && !/^[cwghqfevdprst]_/.test(segment));
    if (!assetSegments.length) return null;
    const id = decodeURIComponent(assetSegments.join("/"));
    return /\/raw\/upload\//.test(pathname) ? id : id.replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
}

export function cloudinaryResourceType(url: string): "image" | "video" | "raw" {
  if (/\/video\/upload\//i.test(url)) return "video";
  if (/\/raw\/upload\//i.test(url) || /\.(pdf|doc|docx)$/i.test(url)) return "raw";
  return "image";
}

export async function destroyCloudinaryAsset(
  publicId: string,
  resourceType: "image" | "video" | "raw" = "image",
) {
  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!apiSecret || !apiKey || !cloudName) {
    throw new Error("Cloudinary deletion is not configured");
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await sha1Hex(`invalidate=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`);
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    invalidate: "true",
    api_key: apiKey,
    signature,
  });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`, {
    method: "POST",
    body,
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !["ok", "not found"].includes(result.result)) {
    throw new Error(`Cloudinary deletion failed (${response.status})`);
  }
}

export async function destroyCloudinaryUrl(
  url: string,
  allowedPrefixes: string[],
) {
  const publicId = extractCloudinaryPublicId(url);
  if (!publicId || publicId.includes("..")) throw new Error("Managed Cloudinary media not found");
  if (!allowedPrefixes.some((prefix) => publicId.startsWith(prefix))) {
    throw new Error("Managed Cloudinary media not found");
  }
  await destroyCloudinaryAsset(publicId, cloudinaryResourceType(url));
  return publicId;
}
