const encoder = new TextEncoder();

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function hmac(key: BufferSource, value: string) {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value));
}

function encodePath(value: string) {
  return value.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function requireSecret(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function bunnyStorageConfig() {
  const endpoint = new URL(requireSecret("BUNNY_STORAGE_S3_ENDPOINT"));
  return {
    endpoint,
    accessKeyId: requireSecret("BUNNY_STORAGE_ACCESS_KEY_ID"),
    secretAccessKey: requireSecret("BUNNY_STORAGE_SECRET_ACCESS_KEY"),
    bucket: requireSecret("BUNNY_STORAGE_ZONE"),
    cdnHostname: requireSecret("BUNNY_STORAGE_CDN_HOSTNAME").replace(/^https?:\/\//, "").replace(/\/$/, ""),
    region: "sg",
  };
}

export async function presignBunnyObject(method: "PUT" | "DELETE", objectKey: string, expiresSeconds = 900) {
  const config = bunnyStorageConfig();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = amzDate.slice(0, 8);
  const scope = `${shortDate}/${config.region}/s3/aws4_request`;
  const canonicalUri = `/${encodePath(config.bucket)}/${encodePath(objectKey)}`;
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(Math.max(1, Math.min(expiresSeconds, 604800))),
    "X-Amz-SignedHeaders": "host",
  });
  query.sort();
  const canonicalRequest = [method, canonicalUri, query.toString(), `host:${config.endpoint.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256(canonicalRequest)].join("\n");
  const dateKey = await hmac(encoder.encode(`AWS4${config.secretAccessKey}`), shortDate);
  const regionKey = await hmac(dateKey, config.region);
  const serviceKey = await hmac(regionKey, "s3");
  const signingKey = await hmac(serviceKey, "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));
  return {
    provider: "bunny" as const,
    objectKey,
    uploadUrl: `${config.endpoint.origin}${canonicalUri}?${query.toString()}&X-Amz-Signature=${signature}`,
    publicUrl: `https://${config.cdnHostname}/${encodePath(objectKey)}`,
    expiresAt: new Date(now.getTime() + expiresSeconds * 1000).toISOString(),
  };
}

export function extensionForMime(mimeType: string) {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/heic": "heic", "image/heif": "heif", "application/pdf": "pdf",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  };
  return extensions[mimeType.toLowerCase()] ?? "bin";
}
