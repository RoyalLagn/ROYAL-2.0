import type { ClipUpload } from "../types";

export interface ClipCompressor {
  compress(source: ClipUpload, onProgress?: (progress: number) => void): Promise<ClipUpload>;
}

let compressor: ClipCompressor | null = null;

export const ClipCompressionService = {
  configure(adapter: ClipCompressor | null) {
    compressor = adapter;
  },
  isConfigured() {
    return compressor !== null;
  },
  async compress(source: ClipUpload, onProgress?: (progress: number) => void) {
    if (!compressor) throw new Error("Clip compression adapter is not configured.");
    return compressor.compress(source, onProgress);
  },
};
