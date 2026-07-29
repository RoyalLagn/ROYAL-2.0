import { useCallback } from "react";
import { ClipService } from "../services";
import type { ClipCursor } from "../types";

export function useVendorClips(vendorId: string) {
  const load = useCallback(
    (cursor?: ClipCursor | null, limit?: number) => ClipService.list({ vendorId, cursor, limit }),
    [vendorId],
  );
  return { load };
}
