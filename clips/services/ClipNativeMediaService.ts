import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { clipsConfig } from "../config";
import type { ClipUpload } from "../types";
import { ClipModuleError } from "../utils/errors";
import { buildClipCompressionPlan } from "../utils/compressionPlan";
import { ClipCompressionService } from "./ClipCompressionService";
import { ClipThumbnailService } from "./ClipThumbnailService";
import { validateClipSource } from "../utils/validation";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

const localMediaDirectory = `${FileSystem.documentDirectory || ""}royallagn-clips/`;

// `react-native-compressor` requires native NitroModules that are not available
// inside Expo Go. Load it lazily so the app does not crash at import time; when
// it is unavailable (Expo Go), oversized uploads fail clearly before the
// original file can reach Bunny.
type CompressorModule = typeof import("react-native-compressor");
let compressorModule: CompressorModule | null | undefined;
function getCompressor(): CompressorModule | null {
  if (compressorModule !== undefined) return compressorModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    compressorModule = require("react-native-compressor") as CompressorModule;
  } catch {
    compressorModule = null;
  }
  return compressorModule;
}

async function persistLocalMedia(uri: string, fileName: string) {
  if (Platform.OS === "web" || !FileSystem.documentDirectory) return uri;
  await FileSystem.makeDirectoryAsync(localMediaDirectory, { intermediates: true });
  const safeName = fileName.replace(/[^a-z0-9._-]/gi, "-");
  const destination = `${localMediaDirectory}${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}

export async function pickClipVideos(selectionLimit = 10): Promise<ClipUpload[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new ClipModuleError("PERMISSION_ERROR", "Photo library access is required.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["videos"],
    allowsMultipleSelection: true,
    selectionLimit: Math.max(1, Math.min(selectionLimit, 10)),
    quality: 1,
  });
  if (result.canceled) return [];
  const compressor = getCompressor();
  const persisted: ClipUpload[] = [];
  try {
    // Validate before copying into durable storage. Process sequentially so a
    // bad item cannot leave other copies racing in the background.
    for (const asset of result.assets) {
      const metadata = compressor
        ? await compressor.getVideoMetaData(asset.uri)
        : { size: 0, duration: 0, width: 0, height: 0, extension: "mp4" };
      const fileName = asset.fileName || `clip-${Date.now()}.${metadata.extension || "mp4"}`;
      const candidate: ClipUpload = {
        uri: asset.uri,
        fileName,
        mimeType: asset.mimeType || "video/mp4",
        fileSizeBytes: asset.fileSize || metadata.size,
        durationSeconds: asset.duration ? asset.duration / 1000 : metadata.duration,
        resolution: { width: asset.width || metadata.width, height: asset.height || metadata.height },
      };
      validateClipSource(candidate);
      persisted.push({ ...candidate, uri: await persistLocalMedia(asset.uri, fileName) });
    }
    return persisted;
  } catch (error) {
    await Promise.all(persisted.map((item) => deleteLocalClipMedia(item.uri)));
    throw error;
  }
}

export async function deleteLocalClipMedia(uri: string | null | undefined) {
  if (Platform.OS === "web" || !uri || !FileSystem.documentDirectory) return;
  if (uri.startsWith(localMediaDirectory)) {
    await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}

export async function pickClipThumbnail(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new ClipModuleError("PERMISSION_ERROR", "Photo library access is required.");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [9, 16],
    quality: 0.9,
  });
  if (result.canceled || !result.assets[0]) return null;
  // Normalize every custom cover to real JPEG bytes because the clip upload
  // contract stores covers as image/jpeg.
  const normalized = await manipulateAsync(result.assets[0].uri, [], {
    compress: 0.85,
    format: SaveFormat.JPEG,
  });
  return persistLocalMedia(
    normalized.uri,
    result.assets[0].fileName || `clip-thumbnail-${Date.now()}.jpg`,
  );
}

ClipCompressionService.configure({
  async compress(source, onProgress) {
    const compressor = getCompressor();
    if (!compressor) {
      // Expo Go: native compression is unavailable. Never fall back to the
      // oversized original because the storage contract is a hard 40 MiB.
      throw new ClipModuleError(
        "COMPRESSION_ERROR",
        "Automatic compression requires the RoyalLagn development or production app and is unavailable in standard Expo Go.",
      );
    }
    const { Video, getVideoMetaData } = compressor;
    const attempts = buildClipCompressionPlan(source);
    let previousTemporaryUri: string | null = null;
    try {
      for (let index = 0; index < attempts.length; index += 1) {
        const attempt = attempts[index];
        let cancellationId = "";
        const uri = await Video.compress(source.uri, {
          compressionMethod: "manual",
          maxSize: attempt.maxDimension,
          bitrate: attempt.videoBitrate,
          stripAudio: false,
          getCancellationId: (value) => { cancellationId = value; },
        }, (progress) => onProgress?.((index + progress) / attempts.length));
        const metadata = await getVideoMetaData(uri);
        if (!metadata.size) {
          if (cancellationId) Video.cancelCompression(cancellationId);
          throw new ClipModuleError("COMPRESSION_ERROR", "Unable to verify the compressed video.");
        }
        if (previousTemporaryUri && previousTemporaryUri !== uri) {
          await FileSystem.deleteAsync(previousTemporaryUri, { idempotent: true }).catch(() => undefined);
        }
        previousTemporaryUri = uri;
        if (metadata.size <= clipsConfig.media.maximumFinalFileSizeBytes) {
          onProgress?.(1);
          return {
            ...source,
            uri,
            fileName: source.fileName.replace(/\.[^.]+$/, ".mp4"),
            mimeType: "video/mp4",
            fileSizeBytes: metadata.size,
            durationSeconds: metadata.duration,
            resolution: { width: metadata.width, height: metadata.height },
          };
        }
      }
    } catch (error) {
      if (previousTemporaryUri) {
        await FileSystem.deleteAsync(previousTemporaryUri, { idempotent: true }).catch(() => undefined);
      }
      if (error instanceof ClipModuleError) throw error;
      throw new ClipModuleError(
        "COMPRESSION_ERROR",
        "Automatic compression is unavailable in this app build or failed. Please use the RoyalLagn development or production app and try again.",
        false,
        error,
      );
    }
    if (previousTemporaryUri) {
      await FileSystem.deleteAsync(previousTemporaryUri, { idempotent: true }).catch(() => undefined);
    }
    throw new ClipModuleError(
      "COMPRESSION_ERROR",
      "This video could not be compressed to 20 MB. Please choose a shorter video or a lower-resolution clip.",
    );
  },
});

ClipThumbnailService.configure({
  async generate(source, atSeconds) {
    const result = await VideoThumbnails.getThumbnailAsync(source.uri, {
      time: Math.max(0, atSeconds * 1000),
      quality: clipsConfig.thumbnail.quality / 100,
    });
    return { uri: result.uri, capturedAtSeconds: atSeconds };
  },
});
