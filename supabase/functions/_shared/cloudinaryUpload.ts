import { sha1Hex } from "./cloudinaryAdmin.ts";

/** Credentials stay on the server. Every managed upload must fail closed. */
export async function signCloudinaryUpload(folder: string, resourceType = "image", eager?: string) {
  const cloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
  const apiKey = Deno.env.get("CLOUDINARY_API_KEY");
  const apiSecret = Deno.env.get("CLOUDINARY_API_SECRET");
  if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary signed uploads are not configured");
  const params = {
    folder,
    public_id: crypto.randomUUID(),
    timestamp: Math.floor(Date.now() / 1000),
    overwrite: "false",
    unique_filename: "false",
    ...(eager ? { eager } : {}),
  };
  const canonical = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join("&");
  return { ...params, provider: "cloudinary", uploadMode: "signed", resourceType, cloudName, apiKey, signature: await sha1Hex(canonical + apiSecret) };
}
