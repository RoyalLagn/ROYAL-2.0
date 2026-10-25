import { Platform } from "react-native";

export type CloudinaryResourceType = "image" | "video" | "raw";

export type CloudinaryUploadOptions = {
  folder?: string;
  publicId?: string;
  resourceType?: CloudinaryResourceType;
  uploadPreset?: string;
  /** Values issued by an authenticated Supabase Edge Function for a signed upload. */
  cloudName?: string;
  apiKey?: string;
  signature?: string;
  timestamp?: number;
  eager?: string;
  overwrite?: boolean;
  uniqueFilename?: boolean;
  tags?: string[];
  context?: Record<string, string>;
  onProgress?: (progress: number) => void;
};

export type CloudinaryUploadResult = {
  provider: "cloudinary";
  publicId: string;
  secureUrl: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
  duration?: number;
  resourceType: CloudinaryResourceType;
  thumbnailUrl?: string;
  optimizedUrl?: string;
  heroUrl?: string;
  fullscreenUrl?: string;
};

export class CloudinaryError extends Error {
  constructor(
    message: string,
    public readonly code: string = "CLOUDINARY_ERROR",
    public readonly status?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "CloudinaryError";
  }
}

export type CloudinaryTransformOptions = {
  width?: number;
  height?: number;
  crop?: "fill" | "limit" | "fit" | "scale" | "thumb" | "crop";
  gravity?: "auto" | "face" | "center";
  quality?: "auto" | "auto:eco" | "auto:good" | "auto:best" | number;
  format?: "auto" | "jpg" | "png" | "webp" | "mp4";
  dpr?: number;
  flags?: string[];
  startOffset?: number | string;
};

const CLOUD_NAME = (process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME || "hp6vu8o9").trim();
const UPLOAD_PRESET = (process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "").trim();

export function getCloudinaryCloudName(): string {
  return CLOUD_NAME;
}

export function getCloudinaryUploadPreset(): string {
  return UPLOAD_PRESET;
}

/**
 * Checks whether a given URL points to Cloudinary CDN.
 */
export function isCloudinaryUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "res.cloudinary.com";
  } catch { return false; }
}

/**
 * Extracts publicId from a Cloudinary URL.
 * Handles transformed and versioned URLs.
 * e.g. https://res.cloudinary.com/hp6vu8o9/image/upload/v1234/folder/name.jpg -> folder/name
 */
export function extractCloudinaryPublicId(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    if (!isCloudinaryUrl(url)) return null;

    const pathname = parsed.pathname;
    const uploadIndex = pathname.indexOf("/upload/");
    if (uploadIndex === -1) return null;

    let pathAfterUpload = pathname.slice(uploadIndex + "/upload/".length);

    // Remove any transformation segments (segments before v<digits> or matching transformation keys like c_, w_, etc.)
    const segments = pathAfterUpload.split("/");
    const versionIndex = segments.findIndex((seg) => /^v\d+$/.test(seg));

    let assetSegments: string[];
    if (versionIndex !== -1) {
      assetSegments = segments.slice(versionIndex + 1);
    } else {
      // Filter out transformation segments that contain commas or known keys
      assetSegments = segments.filter(
        (seg) => !seg.includes(",") && !/^[cwghqfevdprst]_/.test(seg)
      );
    }

    if (!assetSegments.length) return null;

    const fullAssetPath = decodeURIComponent(assetSegments.join("/"));
    // Strip file extension
    return pathname.includes("/raw/upload/") ? fullAssetPath : fullAssetPath.replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
}

/**
 * Formats transformation options into a Cloudinary transformation string.
 */
function buildTransformSegment(options: CloudinaryTransformOptions = {}): string {
  const parts: string[] = [];

  if (options.crop) {
    parts.push(`c_${options.crop}`);
  }
  if (options.gravity) {
    parts.push(`g_${options.gravity}`);
  }
  if (options.width && options.width > 0) {
    parts.push(`w_${Math.round(options.width)}`);
  }
  if (options.height && options.height > 0) {
    parts.push(`h_${Math.round(options.height)}`);
  }
  if (options.dpr && options.dpr > 1) {
    parts.push(`dpr_${options.dpr}`);
  }
  if (options.quality) {
    parts.push(`q_${options.quality}`);
  } else {
    parts.push("q_auto");
  }
  if (options.format) {
    parts.push(`f_${options.format}`);
  } else {
    parts.push("f_auto");
  }
  if (options.startOffset !== undefined) {
    parts.push(`so_${options.startOffset}`);
  }
  if (options.flags && options.flags.length) {
    parts.push(...options.flags.map((f) => `fl_${f}`));
  }

  return parts.join(",");
}

/**
 * Builds or transforms a Cloudinary image URL.
 * If urlOrPublicId is already a full Cloudinary URL, injects or replaces transformations.
 * If it is a publicId, builds the full HTTPS URL.
 */
export function buildCloudinaryImageUrl(
  urlOrPublicId: string,
  options: CloudinaryTransformOptions = {}
): string {
  if (!urlOrPublicId || typeof urlOrPublicId !== "string") return "";

  const trimmed = urlOrPublicId.trim();
  const transformSegment = buildTransformSegment(options);

  if (isCloudinaryUrl(trimmed)) {
    const uploadIndex = trimmed.indexOf("/upload/");
    if (uploadIndex === -1) return trimmed;

    const base = trimmed.slice(0, uploadIndex + "/upload/".length);
    const afterUpload = trimmed.slice(uploadIndex + "/upload/".length);

    // Check if there are existing transformation segments before the version/asset
    const segments = afterUpload.split("/");
    const versionIndex = segments.findIndex((seg) => /^v\d+$/.test(seg));

    let remainder: string;
    if (versionIndex !== -1) {
      // Replace existing transformations before version
      remainder = segments.slice(versionIndex).join("/");
    } else {
      // Find where transformations end (first segment without transform flags)
      const nonTransformIndex = segments.findIndex(
        (seg) => !seg.includes(",") && !/^[cwghqfevdprst]_/.test(seg)
      );
      remainder = nonTransformIndex !== -1
        ? segments.slice(nonTransformIndex).join("/")
        : afterUpload;
    }

    return transformSegment
      ? `${base}${transformSegment}/${remainder}`
      : `${base}${remainder}`;
  }

  // Not a full URL - treat as publicId
  const cleanPublicId = trimmed.replace(/^\//, "");
  const base = `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/`;
  return transformSegment
    ? `${base}${transformSegment}/${cleanPublicId}`
    : `${base}${cleanPublicId}`;
}

/**
 * Builds standard Cloudinary derivation URLs.
 */
export function getCloudinaryThumbnail(urlOrPublicId: string, width = 400, height = 300): string {
  return buildCloudinaryImageUrl(urlOrPublicId, {
    crop: "fill",
    gravity: "auto",
    width,
    height,
    quality: "auto:eco",
    format: "auto",
  });
}

export function getCloudinaryOptimized(urlOrPublicId: string, width = 1200): string {
  return buildCloudinaryImageUrl(urlOrPublicId, {
    crop: "limit",
    width,
    quality: "auto:good",
    format: "auto",
  });
}

export function getCloudinaryHero(urlOrPublicId: string, width = 1600): string {
  return buildCloudinaryImageUrl(urlOrPublicId, {
    crop: "limit",
    width,
    quality: "auto:good",
    format: "auto",
  });
}

export function getCloudinaryFullscreen(urlOrPublicId: string, width = 2200): string {
  return buildCloudinaryImageUrl(urlOrPublicId, {
    crop: "limit",
    width,
    quality: "auto:good",
    format: "auto",
  });
}

export function getCloudinaryVideoPoster(urlOrPublicId: string, width = 640): string {
  if (!urlOrPublicId) return "";
  const trimmed = urlOrPublicId.trim();
  if (isCloudinaryUrl(trimmed)) {
    return buildCloudinaryImageUrl(trimmed.replace("/video/upload/", "/video/upload/"), {
      crop: "limit",
      width,
      startOffset: "0",
      format: "jpg",
      quality: "auto",
    }).replace(/\.(mp4|mov|webm|m3u8)$/i, ".jpg");
  }
  return `https://res.cloudinary.com/${CLOUD_NAME}/video/upload/so_0,c_limit,w_${width},f_jpg,q_auto/${trimmed.replace(/^\//, "")}.jpg`;
}

/**
 * Native + Web compatible XMLHttpRequest multipart uploader with progress tracking.
 */
function uploadViaXHR(
  url: string,
  formData: FormData,
  onProgress?: (progress: number) => void
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("POST", url);
    xhr.timeout = 180_000;

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          const ratio = Math.min(1, Math.max(0, event.loaded / event.total));
          onProgress(ratio);
        }
      };
    }

    xhr.onload = () => {
      let responseJson: any;
      try {
        responseJson = JSON.parse(xhr.responseText);
      } catch {
        responseJson = { raw: xhr.responseText };
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(responseJson);
      } else {
        const errorMsg =
          responseJson?.error?.message ||
          `Cloudinary upload failed with status ${xhr.status}`;
        reject(new CloudinaryError(errorMsg, "UPLOAD_FAILED", xhr.status, responseJson));
      }
    };

    xhr.onerror = () => {
      reject(new CloudinaryError("Network error during Cloudinary upload", "NETWORK_ERROR"));
    };

    xhr.ontimeout = () => {
      reject(new CloudinaryError("Timeout during Cloudinary upload", "TIMEOUT_ERROR"));
    };

    xhr.send(formData);
  });
}

/**
 * Prepares the file payload into FormData for Web, Android, and iOS.
 */
async function appendFileToFormData(
  formData: FormData,
  fileUri: string,
  fileName?: string,
  mimeType?: string
): Promise<void> {
  const finalName = fileName || `file-${Date.now()}`;
  const finalMime = mimeType || "application/octet-stream";

  if (Platform.OS === "web") {
    // If running in browser, fetch the URI to get a Blob/File
    if (fileUri.startsWith("blob:") || fileUri.startsWith("data:") || fileUri.startsWith("http")) {
      const response = await fetch(fileUri);
      const blob = await response.blob();
      formData.append("file", blob, finalName);
      return;
    }
  }

  // React Native Android / iOS object representation
  formData.append("file", {
    uri: fileUri,
    type: finalMime,
    name: finalName,
  } as any);
}

/**
 * Uploads an image directly to Cloudinary using upload preset.
 */
export async function uploadImageToCloudinary(
  file: {
    uri: string;
    name?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    fileSize?: number;
  },
  options: CloudinaryUploadOptions = {}
): Promise<CloudinaryUploadResult> {
  const preset = options.uploadPreset || UPLOAD_PRESET;
  const signed = Boolean(options.apiKey && options.signature && options.timestamp);
  if (!preset && !signed) {
    throw new CloudinaryError(
      "Cloudinary upload preset is missing. Please check EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET.",
      "CONFIGURATION_ERROR"
    );
  }

  const resourceType = options.resourceType || "image";
  const endpoint = `https://api.cloudinary.com/v1_1/${options.cloudName || CLOUD_NAME}/${resourceType}/upload`;
  const formData = new FormData();

  await appendFileToFormData(formData, file.uri, file.name, file.mimeType || "image/jpeg");
  if (signed) {
    formData.append("api_key", options.apiKey!);
    formData.append("timestamp", String(options.timestamp));
    formData.append("signature", options.signature!);
  } else {
    formData.append("upload_preset", preset);
  }

  if (options.folder) {
    formData.append("folder", options.folder);
  }
  if (options.publicId) {
    formData.append("public_id", options.publicId);
  }
  if (options.tags && options.tags.length) {
    formData.append("tags", options.tags.join(","));
  }
  if (options.context) {
    const ctxString = Object.entries(options.context)
      .map(([k, v]) => `${k}=${v}`)
      .join("|");
    formData.append("context", ctxString);
  }
  if (options.eager) formData.append("eager", options.eager);
  if (options.overwrite !== undefined) formData.append("overwrite", String(options.overwrite));
  if (options.uniqueFilename !== undefined) formData.append("unique_filename", String(options.uniqueFilename));

  const result = await uploadViaXHR(endpoint, formData, options.onProgress);

  const publicId = result.public_id;
  const secureUrl = result.secure_url || result.url;
  const width = result.width || file.width;
  const height = result.height || file.height;
  const format = result.format;
  const bytes = result.bytes || file.fileSize;

  return {
    provider: "cloudinary",
    publicId,
    secureUrl,
    width,
    height,
    format,
    bytes,
    resourceType,
    thumbnailUrl: resourceType === "image" ? getCloudinaryThumbnail(secureUrl, 400, 300) : undefined,
    optimizedUrl: resourceType === "image" ? getCloudinaryOptimized(secureUrl, 1200) : secureUrl,
    heroUrl: resourceType === "image" ? getCloudinaryHero(secureUrl, 1600) : secureUrl,
    fullscreenUrl: resourceType === "image" ? getCloudinaryFullscreen(secureUrl, 2200) : secureUrl,
  };
}

/**
 * Uploads a video directly to Cloudinary using upload preset.
 */
export async function uploadVideoToCloudinary(
  file: {
    uri: string;
    name?: string;
    mimeType?: string;
    duration?: number;
    width?: number;
    height?: number;
    fileSize?: number;
  },
  options: CloudinaryUploadOptions = {}
): Promise<CloudinaryUploadResult> {
  const preset = options.uploadPreset || UPLOAD_PRESET;
  const signed = Boolean(options.apiKey && options.signature && options.timestamp);
  if (!preset && !signed) {
    throw new CloudinaryError(
      "Cloudinary upload preset is missing. Please check EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET.",
      "CONFIGURATION_ERROR"
    );
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${options.cloudName || CLOUD_NAME}/video/upload`;
  const formData = new FormData();

  await appendFileToFormData(formData, file.uri, file.name, file.mimeType || "video/mp4");
  if (signed) {
    formData.append("api_key", options.apiKey!);
    formData.append("timestamp", String(options.timestamp));
    formData.append("signature", options.signature!);
  } else {
    formData.append("upload_preset", preset);
  }

  if (options.folder) {
    formData.append("folder", options.folder);
  }
  if (options.publicId) {
    formData.append("public_id", options.publicId);
  }
  if (options.tags && options.tags.length) {
    formData.append("tags", options.tags.join(","));
  }
  if (options.eager) formData.append("eager", options.eager);
  if (options.overwrite !== undefined) formData.append("overwrite", String(options.overwrite));
  if (options.uniqueFilename !== undefined) formData.append("unique_filename", String(options.uniqueFilename));

  const result = await uploadViaXHR(endpoint, formData, options.onProgress);

  const publicId = result.public_id;
  const secureUrl = result.secure_url || result.url;
  const width = result.width || file.width;
  const height = result.height || file.height;
  const duration = result.duration || (file.duration ? file.duration / 1000 : undefined);
  const format = result.format;
  const bytes = result.bytes || file.fileSize;

  const posterUrl = getCloudinaryVideoPoster(secureUrl);

  return {
    provider: "cloudinary",
    publicId,
    secureUrl,
    width,
    height,
    duration,
    format,
    bytes,
    resourceType: "video",
    thumbnailUrl: posterUrl,
    optimizedUrl: secureUrl,
    heroUrl: secureUrl,
    fullscreenUrl: secureUrl,
  };
}
