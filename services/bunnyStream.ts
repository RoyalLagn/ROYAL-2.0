import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import * as tus from "tus-js-client";
import { supabase } from "./supabase";

export type BunnyStreamAuthorization = {
  provider: "bunny";
  uploadMode: "tus";
  endpoint: string;
  authorizationSignature: string;
  authorizationExpire: number;
  videoId: string;
  libraryId: string;
  videoUrl: string;
  thumbnailUrl: string;
  reservationId?: string | null;
};

type StreamStatus = {
  state: "queued" | "processing" | "ready" | "failed";
  status: number | null;
  storageSize: number;
  encodeProgress: number;
  width?: number;
  height?: number;
  length?: number;
  error?: string;
};

const PROCESSING_POLL_MS = 3_000;
const PROCESSING_TIMEOUT_MS = 7 * 60_000;

function uploadHeaders(auth: BunnyStreamAuthorization) {
  return {
    AuthorizationSignature: auth.authorizationSignature,
    AuthorizationExpire: String(auth.authorizationExpire),
    VideoId: auth.videoId,
    LibraryId: auth.libraryId,
    "Tus-Resumable": "1.0.0",
  };
}

export async function uploadToBunnyStream(
  auth: BunnyStreamAuthorization,
  asset: { uri: string; name: string; mimeType: string; size: number },
  onProgress?: (value: number) => void,
  registerAbort?: (abort: () => void) => void,
) {
  if (!auth.endpoint || !auth.videoId || !auth.videoUrl || !auth.thumbnailUrl) {
    throw new Error("Bunny Stream upload authorization is incomplete.");
  }
  if (Platform.OS === "web") {
    const response = await fetch(asset.uri);
    if (!response.ok) throw new Error(`Unable to read selected video (${response.status}).`);
    const blob = await response.blob();
    if (blob.size <= 0) throw new Error("The selected video file is empty.");
    const file = new File([blob], asset.name, { type: asset.mimeType || blob.type || "video/mp4" });
    await new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: auth.endpoint,
        retryDelays: [0, 3_000, 5_000, 10_000, 20_000],
        headers: {
          AuthorizationSignature: auth.authorizationSignature,
          AuthorizationExpire: String(auth.authorizationExpire),
          VideoId: auth.videoId,
          LibraryId: auth.libraryId,
        },
        metadata: { filetype: file.type, title: file.name },
        removeFingerprintOnSuccess: true,
        onProgress: (uploaded, total) => total > 0 && onProgress?.(uploaded / total),
        onError: reject,
        onSuccess: () => resolve(),
      });
      registerAbort?.(() => upload.abort(true).catch(() => undefined));
      upload.start();
    });
    onProgress?.(1);
    return { bytes: file.size };
  }

  const headers = uploadHeaders(auth);
  const create = await fetch(auth.endpoint, {
    method: "POST",
    headers: {
      ...headers,
      "Upload-Length": String(asset.size),
      "Upload-Metadata": `filename ${btoa(asset.name)},filetype ${btoa(asset.mimeType)},title ${btoa(asset.name)}`,
    },
  });
  const location = create.headers.get("Location");
  if (!create.ok || !location) throw new Error(`Bunny Stream upload could not start (${create.status}).`);
  const uploadUrl = new URL(location, auth.endpoint).toString();
  const task = FileSystem.createUploadTask(uploadUrl, asset.uri, {
    httpMethod: "PATCH",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      ...headers,
      "Upload-Offset": "0",
      "Content-Type": "application/offset+octet-stream",
    },
  }, ({ totalBytesSent, totalBytesExpectedToSend }) => {
    if (totalBytesExpectedToSend > 0) onProgress?.(totalBytesSent / totalBytesExpectedToSend);
  });
  registerAbort?.(() => task.cancelAsync().catch(() => undefined));
  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`Bunny Stream upload failed (${result?.status ?? "network"}).`);
  }
  onProgress?.(1);
  return { bytes: asset.size };
}

export async function waitForBunnyStreamReady(
  videoId: string,
  vendorId: string,
  purpose: "clip" | "portfolio",
  timeoutMs = PROCESSING_TIMEOUT_MS,
) {
  const startedAt = Date.now();
  let last: StreamStatus | null = null;
  while (Date.now() - startedAt < timeoutMs) {
    const { data, error } = await supabase.functions.invoke<StreamStatus>("bunny-stream-status", {
      body: { videoId, vendorId, purpose },
    });
    if (error) throw new Error(error.message || "Unable to verify Bunny Stream processing.");
    last = data;
    if (data?.state === "ready" && data.storageSize > 0) return data;
    if (data?.state === "failed") throw new Error(data.error || `Bunny Stream processing failed (status ${data.status ?? "unknown"}).`);
    await new Promise((resolve) => setTimeout(resolve, PROCESSING_POLL_MS));
  }
  throw new Error(
    `Bunny Stream processing did not finish in time (status ${last?.status ?? "unknown"}, ${last?.encodeProgress ?? 0}%).`,
  );
}
