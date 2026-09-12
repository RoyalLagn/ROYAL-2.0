import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { supabase } from "./supabase";

export type BunnySignedUpload = {
  provider: "bunny";
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  expiresAt: string;
};

export async function authorizeBunnyUpload(functionName: string, body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke<BunnySignedUpload>(functionName, { body });
  if (error) throw error;
  return data?.provider === "bunny" && data.uploadUrl && data.publicUrl ? data : null;
}

export async function uploadToBunny(signed: BunnySignedUpload, uri: string, mimeType: string, onProgress?: (value: number) => void) {
  if (Platform.OS !== "web") {
    const task = FileSystem.createUploadTask(
      signed.uploadUrl,
      uri,
      { httpMethod: "PUT", uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { "Content-Type": mimeType } },
      ({ totalBytesSent, totalBytesExpectedToSend }) => {
        if (totalBytesExpectedToSend > 0) onProgress?.(totalBytesSent / totalBytesExpectedToSend);
      },
    );
    const result = await task.uploadAsync();
    if (!result || result.status < 200 || result.status >= 300) {
      const detail = result?.body?.trim().replace(/\s+/g, " ").slice(0, 180);
      throw new Error(`Bunny upload failed (${result?.status ?? "network"})${detail ? `: ${detail}` : ""}`);
    }
    return signed.publicUrl;
  }
  const blob = await fetch(uri).then((response) => response.blob());
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", signed.uploadUrl);
    request.setRequestHeader("Content-Type", mimeType);
    request.upload.onprogress = (event) => event.lengthComputable && onProgress?.(event.loaded / event.total);
    request.onerror = () => reject(new Error("Network error during Bunny upload"));
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) return resolve();
      const detail = request.responseText.trim().replace(/\s+/g, " ").slice(0, 180);
      reject(new Error(`Bunny upload failed (${request.status})${detail ? `: ${detail}` : ""}`));
    };
    request.send(blob);
  });
  return signed.publicUrl;
}
