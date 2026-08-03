import * as ImagePicker from "expo-image-picker";
import * as VideoThumbnails from "expo-video-thumbnails";
import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { clipsConfig } from "../config";
import type { ClipUpload } from "../types";
import { ClipModuleError } from "../utils/errors";
import { ClipCompressionService } from "./ClipCompressionService";
import { ClipThumbnailService } from "./ClipThumbnailService";

const localMediaDirectory = `${FileSystem.documentDirectory || ""}royallagn-clips/`;

// `react-native-compressor` requires native NitroModules that are not available
// inside Expo Go. Load it lazily so the app does not crash at import time; when
// it is unavailable (Expo Go), uploads proceed without client-side compression.
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
  return Promise.all(result.assets.map(async (asset) => {
    const metadata = compressor
      ? await compressor.getVideoMetaData(asset.uri)
      : { size: 0, duration: 0, width: 0, height: 0, extension: "mp4" };
    const fileName = asset.fileName || `clip-${Date.now()}.${metadata.extension || "mp4"}`;
    const durableUri = await persistLocalMedia(asset.uri, fileName);
    return {
      uri: durableUri,
      fileName,
      mimeType: asset.mimeType || "video/mp4",
      fileSizeBytes: asset.fileSize || metadata.size,
      durationSeconds: asset.duration ? asset.duration / 1000 : metadata.duration,
      resolution: {
        width: asset.width || metadata.width,
        height: asset.height || metadata.height,
      },
    };
  }));
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
  return persistLocalMedia(
    result.assets[0].uri,
    result.assets[0].fileName || `clip-thumbnail-${Date.now()}.jpg`,
  );
}

ClipCompressionService.configure({
  async compress(source, onProgress) {
    const compressor = getCompressor();
    if (!compressor) {
      // Expo Go: native compression unavailable — upload the original video.
      onProgress?.(1);
      return source;
    }
    const { Video, getVideoMetaData } = compressor;
    let cancellationId = "";
    const uri = await Video.compress(source.uri, {
      compressionMethod: "manual",
      maxSize: Math.max(clipsConfig.media.maximumWidth, clipsConfig.media.maximumHeight),
      bitrate: clipsConfig.compression.targetVideoBitrate,
      getCancellationId: (value) => { cancellationId = value; },
    }, onProgress);
    const metadata = await getVideoMetaData(uri);
    if (!metadata.size) {
      if (cancellationId) Video.cancelCompression(cancellationId);
      throw new ClipModuleError("COMPRESSION_ERROR", "Unable to verify the compressed video.");
    }
    return {
      ...source,
      uri,
      fileName: source.fileName.replace(/\.[^.]+$/, ".mp4"),
      mimeType: "video/mp4",
      fileSizeBytes: metadata.size,
      durationSeconds: metadata.duration,
      resolution: { width: metadata.width, height: metadata.height },
    };
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
