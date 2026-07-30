import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PublicClipFeedSession } from "../types";

const VIEWER_SESSION_KEY = "@royallagn/clips/public-view-session/v1";
const RECENTLY_VIEWED_KEY = "@royallagn/clips/recently-viewed/v1";
const MAXIMUM_RECENTLY_VIEWED = 250;

export type RecentClipWatch = {
  watchedAt: string;
  watchDurationSeconds: number;
  watchPercentage: number | null;
};

function randomId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function getRecentlyViewed(): Promise<Record<string, RecentClipWatch>> {
  try {
    const stored = await AsyncStorage.getItem(RECENTLY_VIEWED_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).flatMap(([clipId, value]) => {
      if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
        return [[clipId, {
          watchedAt: value,
          watchDurationSeconds: 3,
          watchPercentage: null,
        } satisfies RecentClipWatch]];
      }
      if (!value || typeof value !== "object") return [];
      const candidate = value as Partial<RecentClipWatch>;
      if (
        typeof candidate.watchedAt !== "string"
        || !Number.isFinite(Date.parse(candidate.watchedAt))
      ) return [];
      return [[clipId, {
        watchedAt: candidate.watchedAt,
        watchDurationSeconds: Math.max(0, Number(candidate.watchDurationSeconds) || 0),
        watchPercentage: candidate.watchPercentage === null
          ? null
          : Math.min(100, Math.max(0, Number(candidate.watchPercentage) || 0)),
      } satisfies RecentClipWatch]];
    }));
  } catch {
    return {};
  }
}

export const ClipViewerSessionService = {
  createFeedSession(): PublicClipFeedSession {
    return {
      seed: randomId(),
      startedAt: new Date().toISOString(),
    };
  },

  async getAnonymousSessionHash() {
    const existing = await AsyncStorage.getItem(VIEWER_SESSION_KEY);
    if (existing) return existing;
    const created = randomId();
    await AsyncStorage.setItem(VIEWER_SESSION_KEY, created);
    return created;
  },

  getRecentlyViewed,

  async recordRecentlyViewed(
    clipId: string,
    watchDurationSeconds = 3,
    watchPercentage: number | null = null,
  ) {
    try {
      const current = await getRecentlyViewed();
      const entries = Object.entries({
        ...current,
        [clipId]: {
          watchedAt: new Date().toISOString(),
          watchDurationSeconds: Math.max(0, watchDurationSeconds),
          watchPercentage: watchPercentage === null
            ? null
            : Math.min(100, Math.max(0, watchPercentage)),
        } satisfies RecentClipWatch,
      })
        .sort((left, right) =>
          Date.parse(right[1].watchedAt) - Date.parse(left[1].watchedAt),
        )
        .slice(0, MAXIMUM_RECENTLY_VIEWED);
      await AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(Object.fromEntries(entries)));
    } catch {
      // View analytics must remain independent from local personalization storage.
    }
  },
};
