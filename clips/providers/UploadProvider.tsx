import React, { createContext, useCallback, useMemo, useState } from "react";
import type { ClipUploadDraft, UploadProgress } from "../types";

const initialProgress: UploadProgress = {
  stage: "idle", progress: 0, bytesUploaded: 0, totalBytes: 0, attempt: 0,
};
export interface UploadContextValue {
  draft: ClipUploadDraft | null;
  progress: UploadProgress;
  setDraft: React.Dispatch<React.SetStateAction<ClipUploadDraft | null>>;
  setProgress: React.Dispatch<React.SetStateAction<UploadProgress>>;
  reset: () => void;
}
export const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<ClipUploadDraft | null>(null);
  const [progress, setProgress] = useState<UploadProgress>(initialProgress);
  const reset = useCallback(() => {
    setDraft(null);
    setProgress(initialProgress);
  }, []);
  const value = useMemo(() => ({ draft, progress, setDraft, setProgress, reset }), [draft, progress, reset]);
  return <UploadContext.Provider value={value}>{children}</UploadContext.Provider>;
}
