import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import { authorizeBunnyUpload, uploadToBunny, type BunnySignedUpload } from "./bunnyStorage";
import {
  uploadToBunnyStream,
  waitForBunnyStreamReady,
  type BunnyStreamAuthorization,
} from "./bunnyStream";

export type MediaErrorCode =
  | "CONFIGURATION_ERROR"
  | "PERMISSION_DENIED"
  | "NETWORK_ERROR"
  | "UPLOAD_ERROR"
  | "PICKER_ERROR";

export class MediaError extends Error {
  constructor(
    message: string,
    public readonly code: MediaErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "MediaError";
  }
}

export type PickImageOptions = {
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
};

export type PortfolioAsset = ImagePicker.ImagePickerAsset;
export type ReviewPhotoAsset = ImagePicker.ImagePickerAsset;
export type MediaUpload = {
  secureUrl: string;
  optimizedUrl?: string;
  heroUrl?: string;
  fullscreenUrl?: string;
  publicId: string;
  resourceType: "image" | "video";
  format?: string;
  width?: number;
  height?: number;
  duration?: number;
  bytes?: number;
  originalBytes?: number;
  optimizedBytes?: number;
  thumbnailUrl?: string;
  videoPosterUrl?: string;
  /** Set for image uploads: the reservation held against the vendor's
   * total-photo plan quota (reserve_photo_upload_slot). Must be finalized
   * via finalize_photo_upload after the Bunny upload succeeds, or the
   * insert is rejected. Null for videos, which aren't quota-limited here. */
  reservationId?: string | null;
};

type SignedUpload = {
  provider?: "bunny";
  uploadUrl?: string;
  publicUrl?: string;
  objectKey?: string;
  expiresAt?: string;
  uploadMode?: "signed" | "unsigned" | "tus";
  endpoint?: string;
  authorizationSignature?: string;
  authorizationExpire?: number;
  videoId?: string;
  libraryId?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  signature?: string;
  timestamp?: number;
  folder?: string;
  apiKey?: string;
  cloudName?: string;
  resourceType: "image" | "video";
  public_id?: string;
  overwrite?: string;
  unique_filename?: string;
  eager?: string;
  uploadPreset?: string;
  remainingCapacity: number;
  reservationId?: string | null;
};

export type ProfileImageTarget =
  | { kind: "customer" }
  | { kind: "vendor"; vendorId: string };

export type ProfileImageAsset = Pick<
  ImagePicker.ImagePickerAsset,
  "uri" | "width" | "height" | "fileName" | "mimeType" | "fileSize"
>;

export const PROFILE_IMAGE_SIZE = 1024;
export const FINAL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export type ImageUploadPurpose = "profile" | "portfolio" | "review" | "general";
export type ImagePreparationStage = "optimizing" | "uploading";
type ImageLikeAsset = Pick<ImagePicker.ImagePickerAsset,
  "uri" | "width" | "height" | "fileName" | "mimeType" | "fileSize"
> & { type?: ImagePicker.ImagePickerAsset["type"] };

const IMAGE_LONG_EDGE: Record<ImageUploadPurpose, number> = {
  profile: 1200,
  portfolio: 2200,
  review: 1800,
  general: 2000,
};

async function imageAssetBytes(asset: Pick<ImageLikeAsset, "uri" | "fileSize">) {
  if (Number.isFinite(asset.fileSize) && Number(asset.fileSize) > 0) return Number(asset.fileSize);
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error(`Unable to read selected image (${response.status}).`);
  return (await response.blob()).size;
}

/**
 * Central image preparation pipeline used by every normal Bunny image
 * upload. Source files may be any practical camera size; only the prepared
 * output is subject to the five-megabyte upload boundary.
 */
export async function prepareImageForUpload<T extends ImageLikeAsset>(
  asset: T,
  purpose: ImageUploadPurpose = "general",
  onStage?: (stage: ImagePreparationStage) => void,
): Promise<T> {
  const mimeType = (asset.mimeType || "image/jpeg").toLowerCase();
  if (!PROFILE_IMAGE_TYPES.has(mimeType)) {
    throw new MediaError("Choose a JPG, PNG, WebP, HEIC or HEIF image.", "UPLOAD_ERROR");
  }

  let sourceBytes: number;
  try {
    sourceBytes = await imageAssetBytes(asset);
  } catch (error) {
    throw new MediaError("Unable to prepare the selected image.", "UPLOAD_ERROR", error);
  }
  if (!Number.isFinite(sourceBytes) || sourceBytes <= 0) {
    throw new MediaError("Unable to read the selected image.", "UPLOAD_ERROR");
  }

  const maxLongEdge = IMAGE_LONG_EDGE[purpose];
  const sourceLongEdge = Math.max(asset.width || 0, asset.height || 0);
  if (sourceBytes <= FINAL_IMAGE_MAX_BYTES && (!sourceLongEdge || sourceLongEdge <= maxLongEdge)) {
    onStage?.("uploading");
    return { ...asset, fileSize: sourceBytes };
  }

  onStage?.("optimizing");
  const preservePng = mimeType === "image/png";
  const format = preservePng ? SaveFormat.PNG : SaveFormat.JPEG;
  const attempts = preservePng
    ? [1, 0.82, 0.68, 0.54, 0.42, 0.32]
    : [1, 0.9, 0.8, 0.7, 0.6, 0.48, 0.36];
  const qualities = [0.88, 0.84, 0.78, 0.7, 0.62, 0.54, 0.46];
  let lastError: unknown;

  for (let index = 0; index < attempts.length; index += 1) {
    const targetEdge = Math.max(640, Math.round(maxLongEdge * attempts[index]));
    const actions = sourceLongEdge > targetEdge
      ? [{ resize: asset.width >= asset.height ? { width: targetEdge } : { height: targetEdge } }]
      : [];
    try {
      const result = await manipulateAsync(asset.uri, actions, {
        compress: preservePng ? 1 : qualities[Math.min(index, qualities.length - 1)],
        format,
      });
      const bytes = await imageAssetBytes({ uri: result.uri });
      if (bytes <= FINAL_IMAGE_MAX_BYTES) {
        onStage?.("uploading");
        const extension = preservePng ? "png" : "jpg";
        return {
          ...asset,
          uri: result.uri,
          width: result.width,
          height: result.height,
          fileSize: bytes,
          mimeType: preservePng ? "image/png" : "image/jpeg",
          fileName: `${(asset.fileName || `image-${Date.now()}`).replace(/\.[^.]+$/, "")}.${extension}`,
        };
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new MediaError(
    "This image could not be optimized for upload. Try a different image.",
    "UPLOAD_ERROR",
    lastError,
  );
}

type SignedProfileImage = {
  provider?: "bunny";
  uploadUrl?: string;
  publicUrl?: string;
  objectKey?: string;
  expiresAt?: string;
  uploadMode?: "signed" | "unsigned";
  signature?: string;
  timestamp?: number;
  folder: string;
  apiKey?: string;
  cloudName: string;
  public_id: string;
  overwrite?: string;
  unique_filename?: string;
  uploadPreset?: string;
};

async function edgeFunctionErrorMessage(
  error: unknown,
  fallback: string,
) {
  const context = typeof error === "object" && error && "context" in error
    ? (error as { context?: Response }).context
    : null;
  if (context) {
    try {
      const payload = await context.clone().json();
      if (typeof payload?.error === "string" && payload.error.trim()) {
        return payload.error;
      }
    } catch {
      // The SDK error message below remains a useful fallback.
    }
  }
  return error instanceof Error && error.message
    ? error.message
    : fallback;
}

/**
 * Opens the device image library. A null result means the user cancelled.
 */
export async function pickImage(
  options: PickImageOptions = {}
): Promise<ImagePicker.ImagePickerAsset | null> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      throw new MediaError(
        "Photo library permission is required to select an image.",
        "PERMISSION_DENIED"
      );
    }

    // On web, allowsEditing opens an unreliable crop UI that often never
    // resolves — leaving callers stuck on an "Uploading…" spinner.
    const allowsEditing =
      Platform.OS === "web" ? false : (options.allowsEditing ?? false);

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing,
      aspect: allowsEditing ? options.aspect : undefined,
      quality: options.quality ?? 0.9,
    });

    if (result.canceled || !result.assets.length) {
      return null;
    }

    return result.assets[0];
  } catch (error) {
    if (error instanceof MediaError) {
      throw error;
    }

    throw new MediaError(
      "Unable to open the image library.",
      "PICKER_ERROR",
      error
    );
  }
}

/**
 * Uploads one prepared local image to Bunny Storage.
 * Resolves with the HTTPS URL of the uploaded image.
 */
export async function uploadImage(
  image: ImageLikeAsset,
): Promise<string> {
  const prepared = await prepareImageForUpload(image, "general");
  const mimeType = prepared.mimeType ?? "image/jpeg";
  const fileSize = await imageAssetBytes(prepared);
  try {
    const signed = await authorizeBunnyUpload("bunny-media-sign", { purpose: "general", mimeType, fileSize });
    if (!signed) throw new Error("Bunny returned an incomplete upload authorization.");
    return await uploadToBunny(signed, prepared.uri, mimeType);
  } catch (error) {
    throw new MediaError("Unable to authorize Bunny image upload.", "UPLOAD_ERROR", error);
  }
}

/**
 * Convenience helper for the common select-and-upload flow.
 * Resolves with null when selection is cancelled, otherwise the Bunny CDN URL.
 */
export async function pickAndUploadImage(
  options?: PickImageOptions
): Promise<string | null> {
  const image = await pickImage(options);
  return image ? uploadImage(image) : null;
}

export async function validateProfileImage(asset: ProfileImageAsset) {
  const mimeType = asset.mimeType || "image/jpeg";
  const fileSize = await imageAssetBytes(asset);
  if (!PROFILE_IMAGE_TYPES.has(mimeType.toLowerCase())) {
    throw new MediaError("Choose a JPG, PNG, WebP, HEIC or HEIF image.", "UPLOAD_ERROR");
  }
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    throw new MediaError("Unable to read the selected profile image.", "UPLOAD_ERROR");
  }
  return { fileSize, mimeType };
}

export async function pickProfileImage(): Promise<ProfileImageAsset | null> {
  const asset = await pickImage({ allowsEditing: false, quality: 1 });
  if (!asset) return null;
  await validateProfileImage(asset);
  return asset;
}

export async function uploadProfileImage(
  target: ProfileImageTarget,
  asset: ProfileImageAsset,
): Promise<string> {
  const prepared = await prepareImageForUpload(asset, "profile");
  const { fileSize, mimeType } = await validateProfileImage(prepared);
  const { data, error } = await supabase.functions.invoke<SignedProfileImage>("profile-image", {
    body: { ...target, action: "sign", mimeType, fileSize },
  });
  if (error || data?.provider !== "bunny" || !data.uploadUrl || !data.publicUrl || !data.objectKey) {
    throw new MediaError(
      await edgeFunctionErrorMessage(error, "Unable to authorize Bunny profile image upload."),
      "UPLOAD_ERROR",
    );
  }
  return uploadToBunny(data as BunnySignedUpload, prepared.uri, mimeType);
}

export async function deleteManagedProfileImage(
  target: ProfileImageTarget,
  url: string | null | undefined,
) {
  if (!url) return;
  const { error } = await supabase.functions.invoke("profile-image", {
    body: { ...target, action: "delete", url },
  });
  if (error) {
    throw new MediaError(
      await edgeFunctionErrorMessage(error, "Unable to delete the previous profile image."),
      "UPLOAD_ERROR",
    );
  }
}

export type UploadedBusinessDocument = {
  name: string;
  url: string;
  mimeType: string;
  size: number | null;
};

export async function pickAndUploadBusinessDocument(): Promise<UploadedBusinessDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets.length) return null;

  const asset = result.assets[0];
  const pickedMimeType = asset.mimeType || "application/octet-stream";
  if (!pickedMimeType.startsWith("image/") && asset.size && asset.size > 10 * 1024 * 1024) {
    throw new MediaError("Business documents must be 10 MB or smaller.", "PICKER_ERROR");
  }
  let uploadAsset: ImageLikeAsset | typeof asset = asset;
  if (pickedMimeType.startsWith("image/")) {
    uploadAsset = await prepareImageForUpload({
      uri: asset.uri,
      width: 0,
      height: 0,
      fileName: asset.name,
      mimeType: pickedMimeType,
      fileSize: asset.size ?? undefined,
    }, "general");
  }
  const mimeType = uploadAsset.mimeType || pickedMimeType;
  const uploadSize = (uploadAsset as { size?: number; fileSize?: number }).size
    ?? (uploadAsset as { size?: number; fileSize?: number }).fileSize
    ?? 0;
  try {
    const signed = await authorizeBunnyUpload("bunny-media-sign", { purpose: "document", mimeType, fileSize: uploadSize });
    if (!signed) throw new Error("Bunny returned an incomplete upload authorization.");
    const url = await uploadToBunny(signed, uploadAsset.uri, mimeType);
    return { name: asset.name, url, mimeType, size: uploadSize || null };
  } catch (error) {
    throw new MediaError("Unable to authorize Bunny document upload.", "UPLOAD_ERROR", error);
  }
}

export async function pickPortfolioMedia(selectionLimit = 12): Promise<PortfolioAsset[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new MediaError("Media library permission is required.", "PERMISSION_DENIED");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, Math.min(selectionLimit, 15)),
    quality: 0.82,
    videoMaxDuration: 240,
  });
  if (result.canceled) return [];
  for (const asset of result.assets) {
    const isVideo = asset.type === "video";
    const maxBytes = 150 * 1024 * 1024;
    const durationSeconds = isVideo && asset.duration
      ? asset.duration / 1000
      : 0;
    if (durationSeconds > 240) {
      throw new MediaError(
        `${asset.fileName || "Video"} is longer than 4 minutes. Choose a shorter video.`,
        "PICKER_ERROR",
      );
    }
    if (isVideo && asset.fileSize && asset.fileSize > maxBytes) {
      throw new MediaError(
        `${asset.fileName || (isVideo ? "Video" : "Image")} is too large to process. Choose a smaller file.`,
        "PICKER_ERROR",
      );
    }
  }
  return result.assets;
}

export async function uploadPortfolioAsset(
  asset: PortfolioAsset,
  vendorId: string,
  albumId: string,
  onProgress?: (value: number) => void,
  onStage?: (stage: ImagePreparationStage) => void,
): Promise<MediaUpload> {
  const resourceType: "image" | "video" = asset.type === "video" ? "video" : "image";
  const prepared = resourceType === "image"
    ? await prepareImageForUpload(asset, "portfolio", onStage)
    : asset;
  let resolvedFileSize = prepared.fileSize;
  if (!resolvedFileSize) {
    try {
      resolvedFileSize = (await fetch(prepared.uri).then((response) => response.blob())).size;
    } catch {
      throw new MediaError("Unable to read the selected file size.", "PICKER_ERROR");
    }
  }
  const { data, error } = await supabase.functions.invoke<SignedUpload>("portfolio-media-sign", {
    body: {
      vendorId,
      albumId,
      resourceType,
      mimeType: prepared.mimeType || (resourceType === "video" ? "video/mp4" : "image/jpeg"),
      fileSize: resolvedFileSize,
      originalFileSize: asset.fileSize ?? resolvedFileSize,
      batchSize: 1,
    },
  });
  if (error || !data?.uploadMode) {
    throw new MediaError(
      await edgeFunctionErrorMessage(error, "Unable to authorize Bunny upload."),
      "UPLOAD_ERROR",
    );
  }
  if (data.provider === "bunny") {
    const mimeType = prepared.mimeType || (resourceType === "video" ? "video/mp4" : "image/jpeg");
    if (resourceType === "video") {
      if (data.uploadMode !== "tus" || !data.endpoint || !data.authorizationSignature
        || !data.authorizationExpire || !data.videoId || !data.libraryId
        || !data.videoUrl || !data.thumbnailUrl || !data.objectKey) {
        throw new MediaError("Bunny Stream returned incomplete upload authorization.", "UPLOAD_ERROR");
      }
      try {
        const streamAuth = data as BunnyStreamAuthorization & SignedUpload;
        const uploaded = await uploadToBunnyStream(streamAuth, {
          uri: prepared.uri,
          name: prepared.fileName || `portfolio-${Date.now()}.mp4`,
          mimeType,
          size: resolvedFileSize,
        }, onProgress);
        const ready = await waitForBunnyStreamReady(data.videoId, vendorId, "portfolio");
        return {
          secureUrl: data.videoUrl,
          optimizedUrl: data.videoUrl,
          fullscreenUrl: data.videoUrl,
          publicId: data.objectKey,
          resourceType,
          format: "m3u8",
          width: ready.width || prepared.width,
          height: ready.height || prepared.height,
          duration: ready.length || (prepared.duration ? prepared.duration / 1000 : undefined),
          bytes: ready.storageSize || uploaded.bytes,
          originalBytes: asset.fileSize ?? resolvedFileSize,
          optimizedBytes: ready.storageSize || uploaded.bytes,
          thumbnailUrl: data.thumbnailUrl,
          videoPosterUrl: data.thumbnailUrl,
          reservationId: data.reservationId ?? null,
        };
      } catch (caught) {
        await deleteUnstoredPortfolioAsset(vendorId, data.objectKey, "video").catch(() => undefined);
        throw new MediaError(
          caught instanceof Error ? caught.message : "Bunny Stream video processing failed.",
          "UPLOAD_ERROR",
          caught,
        );
      }
    }
    if (data.uploadUrl && data.publicUrl && data.objectKey) {
      const mimeType = prepared.mimeType || "image/jpeg";
      const url = await uploadToBunny(data as BunnySignedUpload, prepared.uri, mimeType, onProgress);
      return {
        secureUrl: url,
        optimizedUrl: resourceType === "image" ? url : undefined,
        heroUrl: resourceType === "image" ? url : undefined,
        fullscreenUrl: url,
        publicId: data.objectKey,
        resourceType,
        format: mimeType.split("/")[1],
        width: prepared.width,
        height: prepared.height,
        duration: undefined,
        bytes: resolvedFileSize,
        originalBytes: asset.fileSize ?? resolvedFileSize,
        optimizedBytes: resourceType === "image" ? resolvedFileSize : undefined,
        thumbnailUrl: resourceType === "image" ? url : undefined,
        reservationId: data.reservationId ?? null,
      };
    }
    throw new MediaError("Bunny Storage returned incomplete upload authorization.", "UPLOAD_ERROR");
  }
  throw new MediaError("Bunny media upload authorization was required but not returned.", "UPLOAD_ERROR");
}

export async function deletePortfolioMedia(
  mediaId: string,
  fallback?: { vendorId: string; publicId: string; resourceType: "image" | "video" },
) {
  const { error } = await supabase.functions.invoke("portfolio-media-delete", {
    body: { mediaId, ...fallback },
  });
  if (error) {
    throw new MediaError(
      await edgeFunctionErrorMessage(error, "Unable to delete media."),
      "UPLOAD_ERROR",
    );
  }
}

export async function deleteUnstoredPortfolioAsset(
  vendorId: string,
  publicId: string,
  resourceType: "image" | "video",
) {
  const { error } = await supabase.functions.invoke("portfolio-media-delete", {
    body: { vendorId, publicId, resourceType },
  });
  if (error) {
    throw new MediaError(
      await edgeFunctionErrorMessage(error, "Unable to clean up uploaded media."),
      "UPLOAD_ERROR",
    );
  }
}

type SignedReviewUpload = {
  provider?: "bunny";
  uploadUrl?: string;
  publicUrl?: string;
  objectKey?: string;
  expiresAt?: string;
  signature?: string;
  timestamp?: number;
  folder?: string;
  apiKey?: string;
  cloudName?: string;
  public_id?: string;
  overwrite?: string;
  unique_filename?: string;
};

export async function pickReviewPhotos(selectionLimit = 4): Promise<ReviewPhotoAsset[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new MediaError(
      "Photo library permission is required.",
      "PERMISSION_DENIED"
    );
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, Math.min(selectionLimit, 6)),
    quality: 0.82,
  });
  if (result.canceled) return [];
  return result.assets;
}

export async function uploadReviewPhoto(
  asset: ReviewPhotoAsset,
  onProgress?: (value: number) => void
): Promise<MediaUpload> {
  const prepared = await prepareImageForUpload(asset, "review");
  let fileSize = prepared.fileSize;
  if (!fileSize) {
    try {
      fileSize = (await fetch(prepared.uri).then((response) => response.blob())).size;
    } catch (error) {
      throw new MediaError(
        "Unable to read the selected review photo.",
        "PICKER_ERROR",
        error
      );
    }
  }
  const mimeType = prepared.mimeType || "image/jpeg";
  const { data, error } =
    await supabase.functions.invoke<SignedReviewUpload>("review-photo-sign", {
      body: { mimeType, fileSize },
    });
  if (error || data?.provider !== "bunny" || !data.uploadUrl || !data.publicUrl || !data.objectKey) {
    throw new MediaError(
      error?.message || "Unable to authorize Bunny review photo upload.",
      "UPLOAD_ERROR"
    );
  }
  const url = await uploadToBunny(data as BunnySignedUpload, prepared.uri, mimeType, onProgress);
  return {
    secureUrl: url,
    publicId: data.objectKey,
    resourceType: "image",
    format: mimeType.split("/")[1],
    width: prepared.width,
    height: prepared.height,
    bytes: fileSize,
    thumbnailUrl: url,
  };
}

export async function deleteReviewPhoto(
  publicId: string,
  reviewId?: string
): Promise<void> {
  const { error } = await supabase.functions.invoke("review-photo-delete", {
    body: { publicId, reviewId },
  });
  if (error) {
    throw new MediaError(
      error.message || "Unable to delete review photo.",
      "UPLOAD_ERROR"
    );
  }
}

export async function deleteAdminManagedImage(url: string): Promise<void> {
  if (!url || !/\.b-cdn\.net\//i.test(url)) return;
  const { error } = await supabase.functions.invoke("admin-bunny-media-delete", { body: { url } });
  if (error) {
    throw new MediaError(
      await edgeFunctionErrorMessage(error, "Unable to delete managed image."),
      "UPLOAD_ERROR",
    );
  }
}

export async function deleteOwnedBunnyUpload(url: string): Promise<void> {
  if (!url || !/\.b-cdn\.net\//i.test(url)) return;
  const { error } = await supabase.functions.invoke("bunny-user-media-delete", { body: { url } });
  if (error) {
    throw new MediaError(
      await edgeFunctionErrorMessage(error, "Unable to delete uploaded media."),
      "UPLOAD_ERROR",
    );
  }
}

export function reviewPhotoPublicId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    if (parsed.hostname.endsWith(".b-cdn.net")) {
      const objectKey = decodeURIComponent(pathname.replace(/^\//, ""));
      return objectKey.startsWith("royallagn/reviews/") && !objectKey.includes("..") ? objectKey : null;
    }
    const uploadIndex = pathname.indexOf("/image/upload/");
    if (uploadIndex < 0) return null;
    const afterUpload = pathname.slice(uploadIndex + "/image/upload/".length);
    const segments = afterUpload.split("/");
    const versionIndex = segments.findIndex((part) => /^v\d+$/.test(part));
    const assetSegments = versionIndex >= 0 ? segments.slice(versionIndex + 1) : segments;
    const publicId = decodeURIComponent(assetSegments.join("/")).replace(/\.[^.]+$/, "");
    return publicId.startsWith("royallagn/reviews/") ? publicId : null;
  } catch {
    return null;
  }
}
