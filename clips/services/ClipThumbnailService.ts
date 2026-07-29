import type { ClipUpload } from "../types";

export interface GeneratedClipThumbnail {
  uri: string;
  capturedAtSeconds: number;
}
export interface ClipThumbnailGenerator {
  generate(source: ClipUpload, atSeconds: number): Promise<GeneratedClipThumbnail>;
}

let generator: ClipThumbnailGenerator | null = null;
export const ClipThumbnailService = {
  configure(adapter: ClipThumbnailGenerator | null) {
    generator = adapter;
  },
  async generate(source: ClipUpload, atSeconds: number) {
    if (!generator) throw new Error("Clip thumbnail adapter is not configured.");
    return generator.generate(source, atSeconds);
  },
};
