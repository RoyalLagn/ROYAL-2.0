import { supabase } from "@/services/supabase";
import type { ClipEngagementState } from "../types";
import { ClipViewerSessionService } from "./ClipViewerSessionService";
import { SavedClipEvents } from "./SavedClipService";

let recordViewFunctionAvailable: boolean | null = null;

export const PublicClipEngagementService = {
  async getMine(clipIds: string[], profileId?: string | null) {
    const initial = Object.fromEntries(clipIds.map((id) => [id, { liked: false, saved: false }])) as Record<string, ClipEngagementState>;
    if (!profileId || !clipIds.length) return initial;
    const [likes, saves] = await Promise.all([
      supabase.from("clip_likes").select("clip_id").eq("profile_id", profileId).in("clip_id", clipIds),
      supabase.from("clip_saves").select("clip_id").eq("profile_id", profileId).in("clip_id", clipIds),
    ]);
    if (likes.error) throw likes.error;
    if (saves.error) throw saves.error;
    likes.data?.forEach((row) => { initial[row.clip_id].liked = true; });
    saves.data?.forEach((row) => { initial[row.clip_id].saved = true; });
    return initial;
  },
  async setLiked(clipId: string, profileId: string, liked: boolean) {
    const result = liked
      ? await supabase.from("clip_likes").insert({ clip_id: clipId, profile_id: profileId })
      : await supabase.from("clip_likes").delete().eq("clip_id", clipId).eq("profile_id", profileId);
    if (result.error && result.error.code !== "23505") throw result.error;
  },
  async setSaved(clipId: string, profileId: string, saved: boolean) {
    SavedClipEvents.emit(clipId, saved);
    const result = saved
      ? await supabase.from("clip_saves").insert({ clip_id: clipId, profile_id: profileId })
      : await supabase.from("clip_saves").delete().eq("clip_id", clipId).eq("profile_id", profileId);
    if (result.error && result.error.code !== "23505") {
      SavedClipEvents.emit(clipId, !saved);
      throw result.error;
    }
  },
  async recordView(
    clipId: string,
    profileId?: string | null,
    clipDurationSeconds?: number,
  ) {
    const watchDurationSeconds = 3;
    const watchPercentage = clipDurationSeconds && clipDurationSeconds > 0
      ? Math.min(100, (watchDurationSeconds / clipDurationSeconds) * 100)
      : null;
    await ClipViewerSessionService.recordRecentlyViewed(
      clipId,
      watchDurationSeconds,
      watchPercentage,
    );
    const anonymousSessionHash = profileId
      ? null
      : await ClipViewerSessionService.getAnonymousSessionHash();
    let rpcData: unknown = null;
    let rpcError: { code?: string; message?: string } | null = null;
    if (recordViewFunctionAvailable !== false) {
      const result = await supabase.rpc("record_public_clip_view", {
        p_clip_id: clipId,
        p_watch_duration_seconds: watchDurationSeconds,
        p_watch_percentage: watchPercentage,
        p_completed: false,
        p_session_hash: anonymousSessionHash,
      });
      rpcData = result.data;
      rpcError = result.error;
      if (rpcError && (
        rpcError.code === "PGRST202"
        || rpcError.code === "42883"
        || rpcError.message?.includes("record_public_clip_view")
      )) recordViewFunctionAvailable = false;
      else if (!rpcError) recordViewFunctionAvailable = true;
    }
    if (recordViewFunctionAvailable === false) {
      if (profileId) {
        const history = await supabase.from("clip_watch_history").upsert({
          user_id: profileId,
          clip_id: clipId,
          watched_at: new Date().toISOString(),
          watch_duration_seconds: watchDurationSeconds,
          watch_percentage: watchPercentage,
        }, { onConflict: "user_id,clip_id" });
        if (
          history.error
          && history.error.code !== "42P01"
          && history.error.code !== "PGRST205"
        ) throw history.error;
      }
      const fallback = await supabase.from("clip_views").insert({
        clip_id: clipId,
        viewer_id: profileId || null,
        session_hash: anonymousSessionHash,
        watch_duration_seconds: watchDurationSeconds,
        completed: false,
      });
      if (fallback.error?.code === "23505") return false;
      if (fallback.error) throw fallback.error;
      return true;
    }
    if (rpcError) throw rpcError;
    return Boolean(rpcData);
  },
  async report(clipId: string, reporterId: string, reason: string, details?: string) {
    const { error } = await supabase.from("clip_reports").insert({
      clip_id: clipId, reporter_id: reporterId, reason,
      details: details?.trim() || null,
    });
    if (error) throw error;
  },
};
