import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "@/services/supabase";
import type { ClipEngagementState } from "../types";
import { SavedClipEvents } from "./SavedClipService";

const SESSION_KEY = "@royallagn/clips/public-view-session/v1";
async function sessionHash() {
  const existing = await AsyncStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const created = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(SESSION_KEY, created);
  return created;
}

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
  async recordView(clipId: string, profileId?: string | null) {
    const result = await supabase.from("clip_views").insert({
      clip_id: clipId, viewer_id: profileId || null,
      session_hash: profileId ? null : await sessionHash(),
      watch_duration_seconds: 3, completed: false,
    });
    if (result.error && result.error.code !== "23505") throw result.error;
  },
  async report(clipId: string, reporterId: string, reason: string, details?: string) {
    const { error } = await supabase.from("clip_reports").insert({
      clip_id: clipId, reporter_id: reporterId, reason,
      details: details?.trim() || null,
    });
    if (error) throw error;
  },
};
