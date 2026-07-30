import { supabase } from "@/services/supabase";
import { ClipViewerSessionService } from "./ClipViewerSessionService";

export const ClipAnalyticsService = {
  async recordView(
    clipId: string,
    watchDurationSeconds = 0,
    completed = false,
    anonymousSessionHash?: string,
  ) {
    if (watchDurationSeconds >= 3) {
      await ClipViewerSessionService.recordRecentlyViewed(
        clipId,
        watchDurationSeconds,
        null,
      );
    }
    const rpcResult = await supabase.rpc("record_public_clip_view", {
      p_clip_id: clipId,
      p_watch_duration_seconds: Math.max(0, watchDurationSeconds),
      p_watch_percentage: null,
      p_completed: completed,
      p_session_hash: anonymousSessionHash ?? null,
    });
    if (!rpcResult.error || !(
      rpcResult.error.code === "PGRST202"
      || rpcResult.error.code === "42883"
      || rpcResult.error.message?.includes("record_public_clip_view")
    )) return rpcResult;
    if (watchDurationSeconds < 3) return { data: false, error: null };

    const { data } = await supabase.auth.getUser();
    const resolvedSessionHash = data.user
      ? null
      : anonymousSessionHash ?? await ClipViewerSessionService.getAnonymousSessionHash();
    return supabase.from("clip_views").insert({
      clip_id: clipId,
      viewer_id: data.user?.id ?? null,
      session_hash: resolvedSessionHash,
      watch_duration_seconds: Math.max(0, watchDurationSeconds),
      completed,
    });
  },
  getVendorAnalytics(vendorId: string) {
    return supabase
      .from("clips")
      .select("id,views_count,likes_count,saves_count")
      .eq("vendor_id", vendorId)
      .is("deleted_at", null);
  },
};
