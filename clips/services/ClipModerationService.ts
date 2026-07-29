import { supabase } from "@/services/supabase";
import type { ClipModerationDecision } from "../types";

export const ClipModerationService = {
  review(clipId: string, decision: ClipModerationDecision, reason?: string) {
    return supabase.rpc("moderate_clip", {
      target_clip_id: clipId,
      decision,
      reason: reason?.trim() || null,
    });
  },
};
