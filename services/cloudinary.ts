import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Platform } from "react-native";
import { supabase } from "./supabase";

const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export type CloudinaryErrorCode =
  | "CONFIGURATION_ERROR"
  | "PERMISSION_DENIED"
  | "NETWORK_ERROR"
  | "UPLOAD_ERROR"
  | "PICKER_ERROR";

export class CloudinaryError extends Error {
  constructor(
    message: string,
    public readonly code: CloudinaryErrorCode,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "CloudinaryError";
  }
}

export type PickImageOptions = {
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
};

export type PortfolioAsset = ImagePicker.ImagePickerAsset;
export type ReviewPhotoAsset = ImagePicker.ImagePickerAsset;
export type CloudinaryUpload = {
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
};

type SignedUpload = {
  uploadMode: "signed" | "unsigned";
  signature?: string;
  timestamp?: number;
  folder: string;
  apiKey?: string;
  cloudName: string;
  resourceType: "image" | "video";
  public_id: string;
  overwrite?: string;
  unique_filename?: string;
  eager?: string;
  uploadPreset?: string;
  remainingCapacity: number;
};

type ProfileImageTarget =
  | { kind: "customer" }
  | { kind: "vendor"; vendorId: string };

type SignedProfileImage = {
  uploadMode: "signed" | "unsigned";
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

function getUploadUrl(): string {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new CloudinaryError(
      "Cloudinary is not configured. Set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET in .env.",
      "CONFIGURATION_ERROR"
    );
  }

  return `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
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
      throw new CloudinaryError(
        "Photo library permission is required to select an image.",
        "PERMISSION_DENIED"
      );
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: options.allowsEditing ?? false,
      aspect: options.aspect,
      quality: options.quality ?? 0.9,
    });

    if (result.canceled || !result.assets.length) {
      return null;
    }

    return result.assets[0];
  } catch (error) {
    if (error instanceof CloudinaryError) {
      throw error;
    }

    throw new CloudinaryError(
      "Unable to open the image library.",
      "PICKER_ERROR",
      error
    );
  }
}

/**
 * Uploads one local image with Cloudinary's unsigned upload preset.
 * Resolves with the HTTPS URL of the uploaded image.
 */
export async function uploadImage(
  image: Pick<ImagePicker.ImagePickerAsset, "uri" | "fileName" | "mimeType">
): Promise<string> {
  const formData = new FormData();
  const fileName = image.fileName ?? `image-${Date.now()}.jpg`;
  const mimeType = image.mimeType ?? "image/jpeg";

  if (Platform.OS === "web") {
    let imageBlob: Blob;

    try {
      const imageResponse = await fetch(image.uri);

      if (!imageResponse.ok) {
        throw new Error(`Unable to read selected image (${imageResponse.status}).`);
      }

      imageBlob = await imageResponse.blob();
    } catch (error) {
      throw new CloudinaryError(
        "Unable to prepare the selected image for upload.",
        "UPLOAD_ERROR",
        error
      );
    }

    const webFile = new File([imageBlob], fileName, {
      type: imageBlob.type || mimeType,
    });
    formData.append("file", webFile);
  } else {
    formData.append(
      "file",
      {
        uri: image.uri,
        name: fileName,
        type: mimeType,
      } as unknown as Blob
    );
  }
  formData.append("upload_preset", UPLOAD_PRESET ?? "");

  let response: Response;

  try {
    response = await fetch(getUploadUrl(), {
      method: "POST",
      body: formData,
    });
  } catch (error) {
    throw new CloudinaryError(
      "Network error while uploading the image. Check your connection and try again.",
      "NETWORK_ERROR",
      error
    );
  }

  let payload: {
    secure_url?: string;
    error?: { message?: string };
  };

  try {
    payload = await response.json();
  } catch (error) {
    throw new CloudinaryError(
      "Cloudinary returned an invalid response.",
      "UPLOAD_ERROR",
      error
    );
  }

  if (!response.ok || !payload.secure_url) {
    throw new CloudinaryError(
      payload.error?.message ?? "Cloudinary image upload failed.",
      "UPLOAD_ERROR"
    );
  }

  return payload.secure_url;
}

/**
 * Convenience helper for the common select-and-upload flow.
 * Resolves with null when selection is cancelled, otherwise the Cloudinary URL.
 */
export async function pickAndUploadImage(
  options?: PickImageOptions
): Promise<string | null> {
  const image = await pickImage(options);
  return image ? uploadImage(image) : null;
}

export async function pickAndUploadProfileImage(
  target: ProfileImageTarget,
): Promise<string | null> {
  const asset = await pickImage({ allowsEditing: true, aspect: [1, 1], quality: 0.88 });
  if (!asset) return null;
  let fileSize = asset.fileSize;
  if (!fileSize) {
    fileSize = (await fetch(asset.uri).then((response) => response.blob())).size;
  }
  const mimeType = asset.mimeType || "image/jpeg";
  const { data, error } = await supabase.functions.invoke<SignedProfileImage>("profile-image", {
    body: { ...target, action: "sign", mimeType, fileSize },
  });
  if (error || !data?.uploadMode) {
    throw new CloudinaryError(
      await edgeFunctionErrorMessage(error, "Unable to authorize profile image upload."),
      "UPLOAD_ERROR",
    );
  }

  const body = new FormData();
  if (Platform.OS === "web") {
    const blob = await fetch(asset.uri).then((response) => response.blob());
    body.append("file", new File([blob], asset.fileName || `profile-${Date.now()}.jpg`, {
      type: mimeType || blob.type,
    }));
  } else {
    body.append("file", {
      uri: asset.uri,
      name: asset.fileName || `profile-${Date.now()}.jpg`,
      type: mimeType,
    } as unknown as Blob);
  }
  if (data.uploadMode === "signed") {
    if (!data.apiKey || !data.timestamp || !data.signature) {
      throw new CloudinaryError("Profile image authorization was incomplete.", "UPLOAD_ERROR");
    }
    body.append("api_key", data.apiKey);
    body.append("timestamp", String(data.timestamp));
    body.append("folder", data.folder);
    body.append("public_id", data.public_id);
    body.append("overwrite", data.overwrite ?? "false");
    body.append("unique_filename", data.unique_filename ?? "false");
    body.append("signature", data.signature);
  } else {
    if (!data.uploadPreset) {
      throw new CloudinaryError("Profile image upload preset is missing.", "UPLOAD_ERROR");
    }
    body.append("upload_preset", data.uploadPreset);
    body.append("folder", data.folder);
    body.append("public_id", data.public_id);
  }

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${data.cloudName}/image/upload`,
    { method: "POST", body },
  );
  const payload = await response.json();
  if (!response.ok || !payload.secure_url) {
    throw new CloudinaryError(payload.error?.message || "Profile image upload failed.", "UPLOAD_ERROR");
  }
  return payload.secure_url;
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
    throw new CloudinaryError(
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
  if (asset.size && asset.size > 10 * 1024 * 1024) {
    throw new CloudinaryError("Business documents must be 10 MB or smaller.", "PICKER_ERROR");
  }
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new CloudinaryError("Cloudinary is not configured.", "CONFIGURATION_ERROR");
  }

  const mimeType = asset.mimeType || "application/octet-stream";
  const resourceType = mimeType.startsWith("image/") ? "image" : "raw";
  const body = new FormData();
  if (Platform.OS === "web") {
    const blob = await fetch(asset.uri).then((response) => response.blob());
    body.append("file", new File([blob], asset.name, { type: mimeType }));
  } else {
    body.append("file", {
      uri: asset.uri,
      name: asset.name,
      type: mimeType,
    } as unknown as Blob);
  }
  body.append("upload_preset", UPLOAD_PRESET);
  body.append("folder", "royallagn/vendor-applications/documents");

  let response: Response;
  try {
    response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`,
      { method: "POST", body },
    );
  } catch (error) {
    throw new CloudinaryError("Network error while uploading the document.", "NETWORK_ERROR", error);
  }
  const payload = await response.json();
  if (!response.ok || !payload.secure_url) {
    throw new CloudinaryError(payload.error?.message || "Document upload failed.", "UPLOAD_ERROR");
  }
  return {
    name: asset.name,
    url: payload.secure_url,
    mimeType,
    size: asset.size ?? null,
  };
}

export async function pickPortfolioMedia(selectionLimit = 12): Promise<PortfolioAsset[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new CloudinaryError("Media library permission is required.", "PERMISSION_DENIED");
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
    const maxBytes = isVideo ? 150 * 1024 * 1024 : 30 * 1024 * 1024;
    const durationSeconds = isVideo && asset.duration
      ? asset.duration / 1000
      : 0;
    if (durationSeconds > 240) {
      throw new CloudinaryError(
        `${asset.fileName || "Video"} is longer than 4 minutes. Choose a shorter video.`,
        "PICKER_ERROR",
      );
    }
    if (asset.fileSize && asset.fileSize > maxBytes) {
      throw new CloudinaryError(
        `${asset.fileName || (isVideo ? "Video" : "Image")} is too large to process. Choose a smaller file.`,
        "PICKER_ERROR",
      );
    }
  }
  return result.assets;
}

function thumbnailFor(cloudName: string, publicId: string, resourceType: "image" | "video") {
  if (resourceType === "video") {
    return `https://res.cloudinary.com/${cloudName}/video/upload/so_0,c_fill,w_720,h_540,q_auto,f_jpg/${publicId}.jpg`;
  }
  return `https://res.cloudinary.com/${cloudName}/image/upload/c_fill,w_720,h_540,q_auto,f_auto/${publicId}`;
}

export async function uploadPortfolioAsset(
  asset: PortfolioAsset,
  vendorId: string,
  albumId: string,
  onProgress?: (value: number) => void,
): Promise<CloudinaryUpload> {
  const resourceType: "image" | "video" = asset.type === "video" ? "video" : "image";
  let resolvedFileSize = asset.fileSize;
  if (!resolvedFileSize) {
    try {
      resolvedFileSize = (await fetch(asset.uri).then((response) => response.blob())).size;
    } catch {
      throw new CloudinaryError("Unable to read the selected file size.", "PICKER_ERROR");
    }
  }
  const { data, error } = await supabase.functions.invoke<SignedUpload>("cloudinary-sign", {
    body: {
      vendorId,
      albumId,
      resourceType,
      mimeType: asset.mimeType || (resourceType === "video" ? "video/mp4" : "image/jpeg"),
      fileSize: resolvedFileSize,
      batchSize: 1,
    },
  });
  if (error || !data?.uploadMode) {
    throw new CloudinaryError(
      await edgeFunctionErrorMessage(error, "Unable to authorize upload."),
      "UPLOAD_ERROR",
    );
  }
  const finalByteLimit = resourceType === "video" ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
  if (data.uploadMode === "unsigned" && resolvedFileSize > finalByteLimit) {
    throw new CloudinaryError(
      resourceType === "video"
        ? "Signed video processing is not configured yet. Choose a video under 25 MB."
        : "Signed image processing is not configured yet. Choose an image under 8 MB.",
      "UPLOAD_ERROR",
    );
  }

  const body = new FormData();
  if (Platform.OS === "web") {
    const blob = await fetch(asset.uri).then((response) => response.blob());
    body.append("file", new File([blob], asset.fileName || `portfolio-${Date.now()}`, { type: asset.mimeType || blob.type }));
  } else {
    body.append("file", { uri: asset.uri, name: asset.fileName || `portfolio-${Date.now()}`, type: asset.mimeType || `${resourceType}/*` } as any);
  }
  if (data.uploadMode === "signed") {
    if (!data.apiKey || !data.timestamp || !data.signature || !data.eager) {
      throw new CloudinaryError("Cloudinary returned incomplete signed upload parameters.", "UPLOAD_ERROR");
    }
    body.append("api_key", data.apiKey);
    body.append("timestamp", String(data.timestamp));
    body.append("folder", data.folder);
    body.append("public_id", data.public_id);
    body.append("overwrite", data.overwrite ?? "false");
    body.append("unique_filename", data.unique_filename ?? "false");
    body.append("eager", data.eager);
    body.append("signature", data.signature);
  } else {
    if (!data.uploadPreset) {
      throw new CloudinaryError("Cloudinary returned incomplete upload-preset parameters.", "UPLOAD_ERROR");
    }
    body.delete("api_key");
    body.delete("timestamp");
    body.delete("signature");
    body.delete("overwrite");
    body.delete("unique_filename");
    body.delete("eager");
    body.append("upload_preset", data.uploadPreset);
    body.append("folder", data.folder);
    body.append("public_id", data.public_id);
  }

  const payload: any = await new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `https://api.cloudinary.com/v1_1/${data.cloudName}/${resourceType}/upload`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onerror = () => reject(new CloudinaryError("Network error during upload.", "NETWORK_ERROR"));
    request.onload = () => {
      try {
        const result = JSON.parse(request.responseText);
        if (request.status < 200 || request.status >= 300) throw new Error(result.error?.message || "Upload failed");
        resolve(result);
      } catch (caught) {
        reject(new CloudinaryError(caught instanceof Error ? caught.message : "Upload failed.", "UPLOAD_ERROR", caught));
      }
    };
    request.send(body);
  });
  const eager = Array.isArray(payload.eager) ? payload.eager : [];
  const imageDerivatives = resourceType === "image" ? eager : [];
  const optimizedVideo = resourceType === "video"
    ? eager.find((item: any) => String(item.secure_url || item.url || "").toLowerCase().endsWith(".mp4"))
    : undefined;
  const videoPoster = resourceType === "video"
    ? eager.find((item: any) => /\.(jpe?g|webp)$/i.test(String(item.secure_url || item.url || "")))
    : undefined;
  const processedBytes = resourceType === "video"
    ? Number(optimizedVideo?.bytes ?? payload.bytes)
    : Math.max(0, ...imageDerivatives.map((item: any) => Number(item.bytes ?? 0)));
  if ((payload.duration && payload.duration > 240) || processedBytes > finalByteLimit) {
    await deleteUnstoredPortfolioAsset(vendorId, payload.public_id, resourceType).catch(() => undefined);
    throw new CloudinaryError(
      resourceType === "video"
        ? "This video could not be processed below 25 MB. Choose a shorter or smaller video."
        : "This image could not be optimized below 8 MB. Choose a smaller image.",
      "UPLOAD_ERROR",
    );
  }
  const optimizedSecureUrl = optimizedVideo?.secure_url || optimizedVideo?.url || payload.secure_url;
  return {
    secureUrl: payload.secure_url,
    optimizedUrl: resourceType === "image" && data.uploadMode === "signed"
      ? imageDerivatives[1]?.secure_url || imageDerivatives[1]?.url
      : resourceType === "video" && data.uploadMode === "signed" ? optimizedSecureUrl : undefined,
    heroUrl: resourceType === "image" && data.uploadMode === "signed"
      ? imageDerivatives[2]?.secure_url || imageDerivatives[2]?.url
      : undefined,
    fullscreenUrl: resourceType === "image" && data.uploadMode === "signed"
      ? imageDerivatives[3]?.secure_url || imageDerivatives[3]?.url
      : resourceType === "video" && data.uploadMode === "signed" ? optimizedSecureUrl : undefined,
    publicId: payload.public_id,
    resourceType,
    format: payload.format,
    width: payload.width,
    height: payload.height,
    duration: payload.duration,
    bytes: processedBytes || payload.bytes,
    originalBytes: payload.bytes,
    optimizedBytes: processedBytes || payload.bytes,
    thumbnailUrl: imageDerivatives[0]?.secure_url
      || imageDerivatives[0]?.url
      || (resourceType === "video" ? videoPoster?.secure_url || videoPoster?.url : undefined)
      || thumbnailFor(data.cloudName, payload.public_id, resourceType),
    videoPosterUrl: videoPoster?.secure_url || videoPoster?.url,
  };
}

export async function deletePortfolioMedia(mediaId: string) {
  const { error } = await supabase.functions.invoke("cloudinary-delete", { body: { mediaId } });
  if (error) throw new CloudinaryError(error.message || "Unable to delete media.", "UPLOAD_ERROR");
}

export async function deleteUnstoredPortfolioAsset(
  vendorId: string,
  publicId: string,
  resourceType: "image" | "video",
) {
  const { error } = await supabase.functions.invoke("cloudinary-delete", {
    body: { vendorId, publicId, resourceType },
  });
  if (error) throw new CloudinaryError(error.message || "Unable to clean up uploaded media.", "UPLOAD_ERROR");
}

type SignedReviewUpload = {
  signature: string;
  timestamp: number;
  folder: string;
  apiKey: string;
  cloudName: string;
  public_id: string;
  overwrite: string;
  unique_filename: string;
};

export async function pickReviewPhotos(selectionLimit = 4): Promise<ReviewPhotoAsset[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new CloudinaryError(
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
  for (const asset of result.assets) {
    if (asset.fileSize && asset.fileSize > 8 * 1024 * 1024) {
      throw new CloudinaryError(
        `${asset.fileName || "Review photo"} must be under 8 MB.`,
        "PICKER_ERROR"
      );
    }
  }
  return result.assets;
}

export async function uploadReviewPhoto(
  asset: ReviewPhotoAsset,
  onProgress?: (value: number) => void
): Promise<CloudinaryUpload> {
  let fileSize = asset.fileSize;
  if (!fileSize) {
    try {
      fileSize = (await fetch(asset.uri).then((response) => response.blob())).size;
    } catch (error) {
      throw new CloudinaryError(
        "Unable to read the selected review photo.",
        "PICKER_ERROR",
        error
      );
    }
  }
  const mimeType = asset.mimeType || "image/jpeg";
  const { data, error } =
    await supabase.functions.invoke<SignedReviewUpload>("review-photo-sign", {
      body: { mimeType, fileSize },
    });
  if (error || !data?.signature) {
    throw new CloudinaryError(
      error?.message || "Unable to authorize review photo upload.",
      "UPLOAD_ERROR"
    );
  }
  const body = new FormData();
  if (Platform.OS === "web") {
    const blob = await fetch(asset.uri).then((response) => response.blob());
    body.append(
      "file",
      new File([blob], asset.fileName || `review-${Date.now()}.jpg`, {
        type: mimeType || blob.type,
      })
    );
  } else {
    body.append("file", {
      uri: asset.uri,
      name: asset.fileName || `review-${Date.now()}.jpg`,
      type: mimeType,
    } as any);
  }
  body.append("api_key", data.apiKey);
  body.append("timestamp", String(data.timestamp));
  body.append("folder", data.folder);
  body.append("public_id", data.public_id);
  body.append("overwrite", data.overwrite);
  body.append("unique_filename", data.unique_filename);
  body.append("signature", data.signature);

  const payload: any = await new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${data.cloudName}/image/upload`
    );
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onerror = () =>
      reject(
        new CloudinaryError(
          "Network error during review photo upload.",
          "NETWORK_ERROR"
        )
      );
    request.onload = () => {
      try {
        const result = JSON.parse(request.responseText);
        if (request.status < 200 || request.status >= 300) {
          throw new Error(result.error?.message || "Upload failed");
        }
        resolve(result);
      } catch (caught) {
        reject(
          new CloudinaryError(
            caught instanceof Error ? caught.message : "Upload failed.",
            "UPLOAD_ERROR",
            caught
          )
        );
      }
    };
    request.send(body);
  });
  return {
    secureUrl: payload.secure_url,
    publicId: payload.public_id,
    resourceType: "image",
    format: payload.format,
    width: payload.width,
    height: payload.height,
    bytes: payload.bytes,
    thumbnailUrl: thumbnailFor(data.cloudName, payload.public_id, "image"),
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
    throw new CloudinaryError(
      error.message || "Unable to delete review photo.",
      "UPLOAD_ERROR"
    );
  }
}

export function reviewPhotoPublicId(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
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
