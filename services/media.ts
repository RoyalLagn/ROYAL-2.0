import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import {
  uploadImageToCloudinary,
  uploadVideoToCloudinary,
  buildCloudinaryImageUrl,
  getCloudinaryThumbnail,
  getCloudinaryOptimized,
  getCloudinaryHero,
  getCloudinaryFullscreen,
  getCloudinaryVideoPoster,
  isCloudinaryUrl,
  extractCloudinaryPublicId,
  type CloudinaryUploadResult,
  type CloudinaryResourceType,
} from "./cloudinary";
import { mediaDeliveryUrl } from "@/utils/mediaDelivery";

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
   * via finalize_photo_upload after upload succeeds. */
  reservationId?: string | null;
};

type SignedUploadResponse = {
  provider?: "cloudinary";
  uploadMode?: "signed" | "unsigned";
  uploadPreset?: string;
  cloudName?: string;
  signature?: string;
  apiKey?: string;
  timestamp?: number;
  folder?: string;
  public_id?: string;
  resourceType: "image" | "video";
  remainingCapacity?: number;
  reservationId?: string | null;
  thumbnailUrl?: string;
  eager?: string;
  overwrite?: string | boolean;
  unique_filename?: string | boolean;
};

function cloudinarySignedOptions(sign: SignedUploadResponse) {
  const signed = sign.uploadMode === "signed";
  return {
    folder: sign.folder,
    publicId: sign.public_id,
    uploadPreset: signed ? undefined : sign.uploadPreset,
    cloudName: sign.cloudName,
    apiKey: signed ? sign.apiKey : undefined,
    signature: signed ? sign.signature : undefined,
    timestamp: signed ? sign.timestamp : undefined,
    eager: signed ? sign.eager : undefined,
    overwrite: signed && sign.overwrite !== undefined ? String(sign.overwrite) === "true" : undefined,
    uniqueFilename: signed && sign.unique_filename !== undefined ? String(sign.unique_filename) === "true" : undefined,
  };
}

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

type ImageLikeAsset = Pick<
  ImagePicker.ImagePickerAsset,
  "uri" | "width" | "height" | "fileName" | "mimeType" | "fileSize"
> & { type?: ImagePicker.ImagePickerAsset["type"] };

const IMAGE_LONG_EDGE: Record<ImageUploadPurpose, number> = {
  profile: 1200,
  portfolio: 2200,
  review: 1800,
  general: 2000,
};

async function imageAssetBytes(asset: Pick<ImageLikeAsset, "uri" | "fileSize">): Promise<number> {
  if (Number.isFinite(asset.fileSize) && Number(asset.fileSize) > 0) return Number(asset.fileSize);
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error(`Unable to read selected image (${response.status}).`);
  return (await response.blob()).size;
}

/**
 * Prepares image for upload by resizing & compressing if larger than 5MB.
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
    const qualities = [0.92, 0.88, 0.82, 0.74, 0.66, 0.58, 0.5];
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

async function edgeFunctionErrorMessage(error: unknown, fallback: string): Promise<string> {
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
      // Fallback below
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Opens the device image library.
 */
export async function pickImage(
  options: PickImageOptions = {}
): Promise<ImagePicker.ImagePickerAsset | null> {
  try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      throw new MediaError("Photo library permission is required to select an image.", "PERMISSION_DENIED");
    }

    const allowsEditing = Platform.OS === "web" ? false : (options.allowsEditing ?? false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing,
      aspect: allowsEditing ? options.aspect : undefined,
      quality: options.quality ?? 0.9,
    });

    if (result.canceled || !result.assets.length) return null;
    return result.assets[0];
  } catch (error) {
    if (error instanceof MediaError) throw error;
    throw new MediaError("Unable to open the image library.", "PICKER_ERROR", error);
  }
}

/**
 * Uploads a single image to Cloudinary.
 */
export async function uploadImage(
  image: ImageLikeAsset,
  options: { folder?: string; onProgress?: (p: number) => void } = {}
): Promise<string> {
  const prepared = await prepareImageForUpload(image, "general");
  try {
    const { data: signData, error: signError } = await supabase.functions.invoke<SignedUploadResponse>("media-upload-sign", {
      body: { folder: options.folder || "royallagn/general", mimeType: prepared.mimeType, fileSize: prepared.fileSize },
    });
    if (signError || !signData) throw new MediaError(await edgeFunctionErrorMessage(signError, "Unable to authorize image upload."), "UPLOAD_ERROR");
    const result = await uploadImageToCloudinary(
      {
        uri: prepared.uri,
        name: prepared.fileName || undefined,
        mimeType: prepared.mimeType,
        width: prepared.width,
        height: prepared.height,
        fileSize: prepared.fileSize,
      },
      {
        ...cloudinarySignedOptions(signData),
        onProgress: options.onProgress,
      }
    );
    return result.secureUrl;
  } catch (error) {
    throw new MediaError(
      error instanceof Error ? error.message : "Unable to upload image.",
      "UPLOAD_ERROR",
      error
    );
  }
}

export async function pickAndUploadImage(
  options?: PickImageOptions & { folder?: string }
): Promise<string | null> {
  const image = await pickImage(options);
  return image ? uploadImage(image, { folder: options?.folder }) : null;
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
  onProgress?: (progress: number) => void
): Promise<string> {
  const prepared = await prepareImageForUpload(asset, "profile");
  await validateProfileImage(prepared);

  try {
    const { data: signData, error: signError } = await supabase.functions.invoke<SignedUploadResponse>(
      "profile-image",
      { body: { ...target, action: "sign", mimeType: prepared.mimeType, fileSize: prepared.fileSize } },
    );
    if (signError || !signData) {
      throw new MediaError(await edgeFunctionErrorMessage(signError, "Unable to authorize profile image upload."), "UPLOAD_ERROR");
    }
    const uploadResult = await uploadImageToCloudinary(
      {
        uri: prepared.uri,
        name: prepared.fileName || undefined,
        mimeType: prepared.mimeType,
        width: prepared.width,
        height: prepared.height,
        fileSize: prepared.fileSize,
      },
      { ...cloudinarySignedOptions(signData), onProgress }
    );
    return uploadResult.secureUrl;
  } catch (error) {
    throw new MediaError(
      error instanceof Error ? error.message : "Unable to upload profile image.",
      "UPLOAD_ERROR",
      error
    );
  }
}

export async function deleteManagedProfileImage(
  target: ProfileImageTarget,
  url: string | null | undefined,
): Promise<void> {
  if (!url) return;
  const { error } = await supabase.functions.invoke("profile-image", {
    body: { ...target, action: "delete", url },
  });
  if (error) {
    throw new MediaError(
      await edgeFunctionErrorMessage(error, "Unable to delete previous profile image."),
      "UPLOAD_ERROR"
    );
  }
}

export type UploadedBusinessDocument = {
  name: string;
  url: string;
  mimeType: string;
  size: number | null;
};

export async function pickAndUploadBusinessDocument(
  userId?: string
): Promise<UploadedBusinessDocument | null> {
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

  const isImage = pickedMimeType.startsWith("image/");
  let uploadUri = asset.uri;
  let finalMime = pickedMimeType;
  let finalSize = asset.size ?? 0;

  if (isImage) {
    const prepared = await prepareImageForUpload({
      uri: asset.uri,
      width: 0,
      height: 0,
      fileName: asset.name,
      mimeType: pickedMimeType,
      fileSize: asset.size ?? undefined,
    }, "general");
    uploadUri = prepared.uri;
    finalMime = prepared.mimeType || pickedMimeType;
    finalSize = prepared.fileSize || finalSize;
  }

  const folder = userId ? `royallagn/documents/${userId}` : "royallagn/documents";

  try {
    const { data: signData, error: signError } = await supabase.functions.invoke<SignedUploadResponse>("media-upload-sign", {
      body: { folder, mimeType: finalMime, fileSize: finalSize },
    });
    if (signError || !signData) throw new MediaError(await edgeFunctionErrorMessage(signError, "Unable to authorize document upload."), "UPLOAD_ERROR");
    const uploadResult = await uploadImageToCloudinary(
      {
        uri: uploadUri,
        name: asset.name,
        mimeType: finalMime,
        fileSize: finalSize,
      },
      {
        ...cloudinarySignedOptions(signData),
        resourceType: isImage ? "image" : "raw",
      }
    );
    if (!isImage) {
      const delivery = await fetch(uploadResult.secureUrl, { method: "HEAD" });
      if (!delivery.ok) {
        await deleteOwnedMediaUpload(uploadResult.secureUrl);
        throw new MediaError("Cloudinary cannot deliver this document yet. Enable PDF delivery in the Cloudinary Security settings before uploading business documents.", "CONFIGURATION_ERROR");
      }
    }
    return {
      name: asset.name,
      url: uploadResult.secureUrl,
      mimeType: finalMime,
      size: finalSize || null,
    };
  } catch (error) {
    throw new MediaError(
      error instanceof Error ? error.message : "Unable to upload document.",
      "UPLOAD_ERROR",
      error
    );
  }
}

export async function pickPortfolioMedia(selectionLimit = 12): Promise<PortfolioAsset[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new MediaError("Media library permission is required.", "PERMISSION_DENIED");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, Math.min(selectionLimit, 15)),
    quality: 0.92,
    videoMaxDuration: 240,
  });
  if (result.canceled) return [];
  for (const asset of result.assets) {
    const isVideo = asset.type === "video";
    const maxBytes = 150 * 1024 * 1024;
    const durationSeconds = isVideo && asset.duration ? asset.duration / 1000 : 0;
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

/**
 * Uploads a portfolio asset (image or video) to Cloudinary, managing plan reservations.
 */
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
      resolvedFileSize = (await fetch(prepared.uri).then((r) => r.blob())).size;
    } catch {
      throw new MediaError("Unable to read the selected file size.", "PICKER_ERROR");
    }
  }

  // 1. Authorize & reserve quota slot with Supabase Edge Function
  const { data: signData, error: signError } = await supabase.functions.invoke<SignedUploadResponse>(
    "portfolio-media-sign",
    {
      body: {
        vendorId,
        albumId,
        resourceType,
        mimeType: prepared.mimeType || (resourceType === "video" ? "video/mp4" : "image/jpeg"),
        fileSize: resolvedFileSize,
        originalFileSize: asset.fileSize ?? resolvedFileSize,
        batchSize: 1,
      },
    }
  );

  if (signError) {
    throw new MediaError(
      await edgeFunctionErrorMessage(signError, "Unable to authorize media upload."),
      "UPLOAD_ERROR"
    );
  }

  if (!signData) throw new MediaError("Upload authorization was empty.", "UPLOAD_ERROR");
  const reservationId = signData.reservationId ?? null;
  const publicId = signData.public_id;
  const signedOptions = cloudinarySignedOptions(signData);

  try {
    if (resourceType === "video") {
      const uploadResult = await uploadVideoToCloudinary(
        {
          uri: prepared.uri,
          name: prepared.fileName || `portfolio-${Date.now()}.mp4`,
          mimeType: prepared.mimeType || "video/mp4",
          duration: asset.duration ?? undefined,
          width: prepared.width,
          height: prepared.height,
          fileSize: resolvedFileSize,
        },
        { ...signedOptions, onProgress }
      );

      return {
        secureUrl: uploadResult.secureUrl,
        optimizedUrl: uploadResult.secureUrl,
        heroUrl: uploadResult.secureUrl,
        fullscreenUrl: uploadResult.secureUrl,
        publicId: uploadResult.publicId,
        resourceType: "video",
        format: uploadResult.format || "mp4",
        width: uploadResult.width,
        height: uploadResult.height,
        duration: uploadResult.duration,
        bytes: uploadResult.bytes || resolvedFileSize,
        originalBytes: asset.fileSize ?? resolvedFileSize,
        optimizedBytes: uploadResult.bytes || resolvedFileSize,
        thumbnailUrl: uploadResult.thumbnailUrl,
        videoPosterUrl: uploadResult.thumbnailUrl,
        reservationId,
      };
    }

    // Image upload
    const uploadResult = await uploadImageToCloudinary(
      {
        uri: prepared.uri,
        name: prepared.fileName || `portfolio-${Date.now()}.jpg`,
        mimeType: prepared.mimeType || "image/jpeg",
        width: prepared.width,
        height: prepared.height,
        fileSize: resolvedFileSize,
      },
      { ...signedOptions, onProgress }
    );

    return {
      secureUrl: uploadResult.secureUrl,
      thumbnailUrl: uploadResult.thumbnailUrl,
      optimizedUrl: uploadResult.optimizedUrl,
      heroUrl: uploadResult.heroUrl,
      fullscreenUrl: uploadResult.fullscreenUrl,
      publicId: uploadResult.publicId,
      resourceType: "image",
      format: uploadResult.format,
      width: uploadResult.width,
      height: uploadResult.height,
      bytes: uploadResult.bytes || resolvedFileSize,
      originalBytes: asset.fileSize ?? resolvedFileSize,
      optimizedBytes: uploadResult.bytes || resolvedFileSize,
      reservationId,
    };
  } catch (caught) {
    if (reservationId) {
      await supabase.rpc("cancel_photo_upload_reservation", { target_reservation_id: reservationId });
    }
    if (publicId) {
      await deleteUnstoredPortfolioAsset(vendorId, `${signData.folder}/${publicId}`, resourceType).catch(() => undefined);
    }
    throw new MediaError(
      caught instanceof Error ? caught.message : "Cloudinary upload failed.",
      "UPLOAD_ERROR",
      caught
    );
  }
}

export async function deletePortfolioMedia(
  mediaId: string,
  fallback?: { vendorId: string; publicId: string; resourceType: "image" | "video" },
): Promise<void> {
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
): Promise<void> {
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

export async function pickReviewPhotos(selectionLimit = 4): Promise<ReviewPhotoAsset[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new MediaError("Photo library permission is required.", "PERMISSION_DENIED");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, Math.min(selectionLimit, 6)),
    quality: 0.92,
  });
  if (result.canceled) return [];
  return result.assets;
}

export async function uploadReviewPhoto(
  asset: ReviewPhotoAsset,
  userId?: string,
  onProgress?: (value: number) => void
): Promise<MediaUpload> {
  const prepared = await prepareImageForUpload(asset, "review");
  try {
    const { data: signData, error: signError } = await supabase.functions.invoke<SignedUploadResponse>(
      "review-photo-sign",
      { body: { mimeType: prepared.mimeType, fileSize: prepared.fileSize } },
    );
    if (signError || !signData) {
      throw new MediaError(await edgeFunctionErrorMessage(signError, "Unable to authorize review photo upload."), "UPLOAD_ERROR");
    }
    const result = await uploadImageToCloudinary(
      {
        uri: prepared.uri,
        name: prepared.fileName || undefined,
        mimeType: prepared.mimeType,
        width: prepared.width,
        height: prepared.height,
        fileSize: prepared.fileSize,
      },
      { ...cloudinarySignedOptions(signData), onProgress }
    );

    return {
      secureUrl: result.secureUrl,
      publicId: result.publicId,
      resourceType: "image",
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      thumbnailUrl: result.thumbnailUrl,
    };
  } catch (error) {
    throw new MediaError(
      error instanceof Error ? error.message : "Unable to upload review photo.",
      "UPLOAD_ERROR",
      error
    );
  }
}

export async function deleteReviewPhoto(
  publicId: string,
  reviewId?: string
): Promise<void> {
  const { error } = await supabase.functions.invoke("review-photo-delete", {
    body: { publicId, reviewId },
  });
  if (error) {
    throw new MediaError(error.message || "Unable to delete review photo.", "UPLOAD_ERROR");
  }
}

export async function deleteOwnedMediaUpload(url: string | null | undefined): Promise<void> {
  if (!url || !isCloudinaryUrl(url)) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { error } = await supabase.functions.invoke("user-media-delete", { body: { url } });
  if (error) {
    throw new MediaError(
      await edgeFunctionErrorMessage(error, "Unable to delete previous upload."),
      "UPLOAD_ERROR"
    );
  }
}

export async function deleteAdminManagedImage(url: string): Promise<void> {
  if (!url) return;
  if (!isCloudinaryUrl(url)) return;
  const { error } = await supabase.functions.invoke("admin-media-delete", { body: { url } });
  if (error) {
    throw new MediaError(
      await edgeFunctionErrorMessage(error, "Unable to delete managed image."),
      "UPLOAD_ERROR"
    );
  }
}

export function reviewPhotoPublicId(url: string): string | null {
  return extractCloudinaryPublicId(url);
}

/**
 * Unified MediaService namespace abstraction as required by Phase 2.
 */
export const MediaService = {
  uploadImage,
  uploadVideo: uploadVideoToCloudinary,
  uploadPortfolioAsset,
  deletePortfolioMedia,
  uploadProfileImage,
  deleteProfileImage: deleteManagedProfileImage,
  uploadReviewPhoto,
  deleteReviewPhoto,
  getDisplayUrl: mediaDeliveryUrl,
  getThumbnailUrl: getCloudinaryThumbnail,
  getOptimizedUrl: getCloudinaryOptimized,
  getHeroUrl: getCloudinaryHero,
  getFullscreenUrl: getCloudinaryFullscreen,
};
