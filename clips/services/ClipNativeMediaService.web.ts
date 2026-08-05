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

/**
 * Capture a still frame from the selected video.
 *
 * This previously threw, which made every web upload fail unless the vendor
 * manually picked a cover -- while the upload screen told them the cover was
 * optional and would be generated automatically. The browser can seek a
 * <video> and draw it to a canvas, so web matches native instead of being a
 * special case.
 */
ClipThumbnailService.configure({
  async generate(source, atSeconds) {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = source.uri;

    try {
      await new Promise<void>((resolve, reject) => {
        const fail = () => reject(new ClipModuleError("UPLOAD_ERROR", "This video could not be read for a cover image."));
        video.onerror = fail;
        video.onloadedmetadata = () => resolve();
        setTimeout(fail, 15000);
      });

      // Seek slightly inside the clip; a frame at exactly 0 is often blank.
      const target = Math.min(Math.max(atSeconds, 0), Math.max(video.duration - 0.1, 0));
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new ClipModuleError("UPLOAD_ERROR", "This video could not be read for a cover image."));
        video.currentTime = target;
        setTimeout(resolve, 15000);
      });

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) {
        throw new ClipModuleError("UPLOAD_ERROR", "This video could not be read for a cover image.");
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new ClipModuleError("UPLOAD_ERROR", "This browser cannot render a cover image.");
      }
      context.drawImage(video, 0, 0, width, height);

      return {
        uri: canvas.toDataURL("image/jpeg", 0.8),
        capturedAtSeconds: target,
      };
    } finally {
      video.removeAttribute("src");
      video.load();
    }
  },
});
