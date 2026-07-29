import { supabase } from "@/services/supabase";

export const ClipAnalyticsService = {
  async recordView(
    clipId: string,
    watchDurationSeconds = 0,
    completed = false,
    anonymousSessionHash?: string,
  ) {
    const { data } = await supabase.auth.getUser();
    return supabase.from("clip_views").insert({
      clip_id: clipId,
      viewer_id: data.user?.id ?? null,
      session_hash: data.user ? null : anonymousSessionHash,
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
