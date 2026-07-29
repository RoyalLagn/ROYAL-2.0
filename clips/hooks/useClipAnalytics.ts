import { useMemo } from "react";
import { ClipAnalyticsService } from "../services";

export function useClipAnalytics(clipId?: string) {
  return useMemo(() => ({
    recordView: (watchDurationSeconds?: number, completed?: boolean, anonymousSessionHash?: string) => {
      if (!clipId) throw new Error("A clip id is required.");
      return ClipAnalyticsService.recordView(clipId, watchDurationSeconds, completed, anonymousSessionHash);
    },
  }), [clipId]);
}
