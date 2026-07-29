import { useContext } from "react";
import { UploadContext } from "../providers";

export function useUploadClip() {
  const context = useContext(UploadContext);
  if (!context) throw new Error("useUploadClip must be used within UploadProvider.");
  return context;
}
