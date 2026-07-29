import * as ImagePicker from "expo-image-picker";
import type { ClipUpload } from "../types";
import { ClipModuleError } from "../utils/errors";
import { ClipCompressionService } from "./ClipCompressionService";
import { ClipThumbnailService } from "./ClipThumbnailService";

export async function pickClipVideos(selectionLimit = 10): Promise<ClipUpload[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, Math.min(selectionLimit, 10)),
    quality: 1,
  });
  if (result.canceled) return [];
  return result.assets.map((asset) => ({
    uri: asset.uri,
    fileName: asset.fileName || `clip-${Date.now()}.mp4`,
    mimeType: asset.mimeType || "video/mp4",
    fileSizeBytes: asset.fileSize || 0,
    durationSeconds: asset.duration ? asset.duration / 1000 : 0,
    resolution: { width: asset.width, height: asset.height },
  }));
}

export async function pickClipThumbnail(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [9, 16],
    quality: 0.9,
  });
  return result.canceled ? null : result.assets[0]?.uri ?? null;
}

ClipCompressionService.configure({
  async compress() {
    throw new ClipModuleError(
      "COMPRESSION_ERROR",
      "Automatic video compression is available in the RoyalLagn Android and iOS apps.",
    );
  },
});

ClipThumbnailService.configure({
  async generate() {
    throw new ClipModuleError(
      "UPLOAD_ERROR",
      "Choose a cover thumbnail when uploading Clips from the web preview.",
    );
  },
});
