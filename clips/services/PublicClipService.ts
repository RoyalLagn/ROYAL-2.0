import { supabase } from "@/services/supabase";
import { listReviewSummaries } from "@/services/reviews";
import { CLIP_FEED_SETTINGS, CLIP_PAGINATION } from "../constants";
import type {
  PublicClip,
  PublicClipCursor,
  PublicClipFeedSession,
  PublicClipPage,
} from "../types";
import { ClipCacheService } from "./ClipCacheService";
import {
  ClipViewerSessionService,
  type RecentClipWatch,
} from "./ClipViewerSessionService";

export interface PublicClipQuery {
  categoryId?: string | null;
  cursor?: PublicClipCursor | null;
  limit?: number;
  session: PublicClipFeedSession;
  pinnedClipId?: string | null;
}

type FeedPositionRow = {
  clip_id: string;
  feed_position: number;
  total_count: number | string;
};

type FallbackCandidate = {
  id: string;
  vendor_id: string;
  published_at: string;
  views_count: number | string;
  likes_count: number | string;
  saves_count: number | string;
};

type FallbackFeedSession = {
  orderedIds: string[];
  createdAt: number;
};

const fallbackFeedSessions = new Map<string, FallbackFeedSession>();
const FALLBACK_CANDIDATE_PAGE_SIZE = 500;
const FALLBACK_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAXIMUM_FALLBACK_SESSIONS = 12;
const RECENT_WATCH_WINDOW_MS = 24 * 60 * 60 * 1000;
const STRONG_PENALTY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MINIMUM_FEED_WITHOUT_RECENT = 10;
let feedFunctionAvailable: boolean | null = null;

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function hashtags(caption?: string | null) {
  return caption?.match(/#[\p{L}\p{N}_]+/gu)?.slice(0, 8) ?? [];
}

function isMissingFeedFunction(error: { code?: string; message?: string }) {
  return error.code === "PGRST202"
    || error.code === "42883"
    || Boolean(error.message?.includes("get_public_clip_feed"));
}

function seededScore(seed: string, clipId: string) {
  const value = `${seed}:${clipId}`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

async function loadFallbackCandidates(categoryId?: string | null) {
  const candidates: FallbackCandidate[] = [];
  let offset = 0;
  while (true) {
    let request = supabase
      .from("clips")
      .select("id,vendor_id,published_at,views_count,likes_count,saves_count")
      .eq("status", "approved")
      .eq("visibility", "public")
      .is("deleted_at", null)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false });
    if (categoryId) request = request.eq("category_id", categoryId);
    const { data, error } = await request.range(
      offset,
      offset + FALLBACK_CANDIDATE_PAGE_SIZE - 1,
    );
    if (error) throw error;
    const page = (data ?? []) as FallbackCandidate[];
    candidates.push(...page);
    if (page.length < FALLBACK_CANDIDATE_PAGE_SIZE) break;
    offset += page.length;
  }
  return candidates;
}

async function loadRecentlyViewed() {
  const recentlyViewed = await ClipViewerSessionService.getRecentlyViewed();
  try {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user?.id) return recentlyViewed;
    const history = await supabase
      .from("clip_watch_history")
      .select("clip_id,watched_at,watch_duration_seconds,watch_percentage")
      .eq("user_id", authData.user.id)
      .order("watched_at", { ascending: false })
      .limit(1000);
    const legacyViews = history.error && (
      history.error.code === "42P01"
      || history.error.code === "PGRST205"
    )
      ? await supabase
        .from("clip_views")
        .select("clip_id,viewed_at,watch_duration_seconds")
        .eq("viewer_id", authData.user.id)
        .order("viewed_at", { ascending: false })
        .limit(1000)
      : null;
    if (history.error && !legacyViews) return recentlyViewed;
    const rows = history.error
      ? (legacyViews?.data ?? []).map((view) => ({
        clip_id: view.clip_id,
        watched_at: view.viewed_at,
        watch_duration_seconds: view.watch_duration_seconds,
        watch_percentage: null,
      }))
      : history.data ?? [];
    rows.forEach((view) => {
      const stored = recentlyViewed[view.clip_id];
      if (!stored || Date.parse(view.watched_at) > Date.parse(stored.watchedAt)) {
        recentlyViewed[view.clip_id] = {
          watchedAt: view.watched_at,
          watchDurationSeconds: Number(view.watch_duration_seconds) || 0,
          watchPercentage: view.watch_percentage === null
            ? null
            : Number(view.watch_percentage),
        } satisfies RecentClipWatch;
      }
    });
  } catch {
    // Local qualified-view history still personalizes the compatibility feed.
  }
  return recentlyViewed;
}

async function createFallbackOrder(query: PublicClipQuery) {
  const [candidates, recentlyViewed] = await Promise.all([
    loadFallbackCandidates(query.categoryId),
    loadRecentlyViewed(),
  ]);
  const snapshotAt = Number.isFinite(Date.parse(query.session.startedAt))
    ? Date.parse(query.session.startedAt)
    : Date.now();
  const engagementValues = candidates.map((candidate) => Math.log1p(
    Math.max(0, Number(candidate.views_count))
      + Math.max(0, Number(candidate.likes_count)) * 4
      + Math.max(0, Number(candidate.saves_count)) * 6,
  ));
  const maximumEngagement = Math.max(0, ...engagementValues);
  const ranked = candidates.map((candidate, index) => {
    const publishedAt = Date.parse(candidate.published_at);
    const ageDays = Math.max(0, snapshotAt - publishedAt) / 86_400_000;
    const freshness = 1 / (1 + ageDays / 30);
    const engagement = maximumEngagement > 0
      ? engagementValues[index] / maximumEngagement
      : 0;
    const recentWatch = recentlyViewed[candidate.id];
    const watchedAt = recentWatch ? Date.parse(recentWatch.watchedAt) : null;
    const timeSinceWatch = watchedAt === null ? null : Math.max(0, snapshotAt - watchedAt);
    const watchGroup = timeSinceWatch === null
      ? 0
      : timeSinceWatch > STRONG_PENALTY_WINDOW_MS
        ? 1
        : timeSinceWatch > RECENT_WATCH_WINDOW_MS ? 2 : 3;
    const recentWatchPenalty = watchGroup === 3 ? 3 : watchGroup === 2 ? 1 : 0;
    return {
      ...candidate,
      newestRank: index + 1,
      watchedAt,
      watchGroup,
      score: (
        0.40 * freshness
        + 0.25 * engagement
        + 0.25 * seededScore(query.session.seed, candidate.id)
        + (watchGroup === 0 ? 0.10 : 0)
        - recentWatchPenalty
      ),
    };
  });
  const nonRecentCount = ranked.filter((candidate) => candidate.watchGroup < 3).length;
  const eligibleRanked = nonRecentCount >= MINIMUM_FEED_WITHOUT_RECENT
    ? ranked.filter((candidate) =>
      candidate.watchGroup < 3 || candidate.id === query.pinnedClipId,
    )
    : ranked;
  eligibleRanked.sort((left, right) => {
    const leftPriority = left.id === query.pinnedClipId ? -1 : left.watchGroup;
    const rightPriority = right.id === query.pinnedClipId ? -1 : right.watchGroup;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    const leftNewUpload = left.watchGroup === 0 && left.newestRank <= 4 ? 0 : 1;
    const rightNewUpload = right.watchGroup === 0 && right.newestRank <= 4 ? 0 : 1;
    if (leftNewUpload !== rightNewUpload) return leftNewUpload - rightNewUpload;
    if (leftNewUpload === 0 && left.newestRank !== right.newestRank) {
      return left.newestRank - right.newestRank;
    }
    if (
      nonRecentCount < MINIMUM_FEED_WITHOUT_RECENT
      && left.watchGroup === 3
      && right.watchGroup === 3
      && left.watchedAt !== right.watchedAt
    ) return (left.watchedAt ?? 0) - (right.watchedAt ?? 0);
    return right.score - left.score
      || Date.parse(right.published_at) - Date.parse(left.published_at)
      || right.id.localeCompare(left.id);
  });

  const orderedIds: string[] = [];
  let lastVendorId: string | null = null;
  let vendorStreak = 0;
  while (eligibleRanked.length) {
    const nextIndex = eligibleRanked.findIndex((candidate) =>
      vendorStreak < 2 || candidate.vendor_id !== lastVendorId,
    );
    if (nextIndex < 0) break;
    const [next] = eligibleRanked.splice(nextIndex, 1);
    orderedIds.push(next.id);
    if (next.vendor_id === lastVendorId) {
      vendorStreak += 1;
    } else {
      lastVendorId = next.vendor_id;
      vendorStreak = 1;
    }
  }
  return orderedIds;
}

async function getFallbackFeedRows(
  query: PublicClipQuery,
  offset: number,
  limit: number,
): Promise<FeedPositionRow[]> {
  const sessionKey = [
    query.session.seed,
    query.categoryId || "all",
    query.pinnedClipId || "",
  ].join(":");
  const now = Date.now();
  for (const [key, session] of fallbackFeedSessions) {
    if (session.createdAt + FALLBACK_SESSION_TTL_MS <= now) fallbackFeedSessions.delete(key);
  }
  let session = fallbackFeedSessions.get(sessionKey);
  if (!session) {
    const orderedIds = await createFallbackOrder(query);
    session = { orderedIds, createdAt: now };
    if (fallbackFeedSessions.size >= MAXIMUM_FALLBACK_SESSIONS) {
      const oldestKey = fallbackFeedSessions.keys().next().value;
      if (oldestKey) fallbackFeedSessions.delete(oldestKey);
    }
    fallbackFeedSessions.set(sessionKey, session);
  }
  return session.orderedIds.slice(offset, offset + limit).map((clipId, index) => ({
    clip_id: clipId,
    feed_position: offset + index,
    total_count: session.orderedIds.length,
  }));
}

async function listVendorPublicClips(vendorId: string): Promise<PublicClip[]> {
  const rows: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.from("clips").select(`
      id,vendor_id,category_id,title,caption,video_url,thumbnail_url,
      duration_seconds,width,height,file_size_bytes,cloudinary_public_id,
      views_count,likes_count,saves_count,status,visibility,
      created_at,updated_at,published_at,deleted_at,
      categories(name),
      vendors!clips_vendor_id_fkey(
        id,business_name,city,logo_url,contact_phone,contact_email,is_verified,
        categories(name)
      )
    `)
      .eq("vendor_id", vendorId)
      .eq("status", "approved")
      .eq("visibility", "public")
      .is("deleted_at", null)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + FALLBACK_CANDIDATE_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as any[];
    rows.push(...page);
    if (page.length < FALLBACK_CANDIDATE_PAGE_SIZE) break;
    offset += page.length;
  }

  const summaries = rows.length ? await listReviewSummaries([vendorId]) : {};
  return rows.map((row): PublicClip => {
    const vendor = one<any>(row.vendors) ?? {};
    const clipCategory = one<any>(row.categories)?.name ?? "Wedding";
    const summary = summaries[row.vendor_id];
    return {
      id: row.id, vendorId: row.vendor_id, categoryId: row.category_id,
      title: row.title, caption: row.caption, videoUrl: row.video_url,
      thumbnailUrl: row.thumbnail_url, durationSeconds: Number(row.duration_seconds),
      resolution: { width: Number(row.width), height: Number(row.height) },
      fileSizeBytes: Number(row.file_size_bytes), cloudinaryPublicId: row.cloudinary_public_id,
      viewsCount: Number(row.views_count), likesCount: Number(row.likes_count),
      savesCount: Number(row.saves_count), status: row.status, visibility: row.visibility,
      createdAt: row.created_at, updatedAt: row.updated_at, publishedAt: row.published_at,
      deletedAt: row.deleted_at, categoryName: clipCategory, hashtags: hashtags(row.caption),
      vendor: {
        id: vendor.id, name: vendor.business_name || "RoyalLagn Vendor",
        city: vendor.city || "", avatarUrl: vendor.logo_url,
        contactPhone: vendor.contact_phone, contactEmail: vendor.contact_email,
        verified: Boolean(vendor.is_verified),
        categoryName: one<any>(vendor.categories)?.name ?? clipCategory,
        rating: Number(summary?.average_rating ?? 0),
        reviewCount: Number(summary?.review_count ?? 0),
      },
    };
  });
}

export const PublicClipService = {
  async listVendor(vendorId: string): Promise<PublicClip[]> {
    const cacheId = vendorId.trim();
    if (!cacheId) return [];
    const cached = ClipCacheService.get<PublicClip[]>("vendor", cacheId);
    if (cached) return cached;
    const clips = await listVendorPublicClips(cacheId);
    ClipCacheService.set("vendor", cacheId, clips, CLIP_FEED_SETTINGS.cacheTtlMs);
    return clips;
  },
  async list(query: PublicClipQuery): Promise<PublicClipPage> {
    const limit = Math.min(Math.max(query.limit ?? CLIP_PAGINATION.defaultPageSize, 1), CLIP_PAGINATION.maximumPageSize);
    const offset = Math.max(query.cursor?.offset ?? 0, 0);
    const cacheId = [
      query.session.seed,
      query.categoryId || "all",
      query.pinnedClipId || "",
      offset,
      limit,
    ].join(":");
    const cached = ClipCacheService.get<PublicClipPage>("feed", cacheId);
    if (cached) return cached;

    let feedData: unknown = null;
    let feedError: { code?: string; message?: string } | null = null;
    if (feedFunctionAvailable !== false) {
      const anonymousSessionHash = await ClipViewerSessionService.getAnonymousSessionHash();
      const rpcResult = await supabase.rpc("get_public_clip_feed", {
        p_seed: query.session.seed,
        p_session_started_at: query.session.startedAt,
        p_offset: offset,
        p_limit: limit,
        p_category_id: query.categoryId || null,
        p_session_hash: anonymousSessionHash,
        p_pinned_clip_id: query.pinnedClipId || null,
      });
      feedData = rpcResult.data;
      feedError = rpcResult.error;
      if (feedError && isMissingFeedFunction(feedError)) feedFunctionAvailable = false;
      else if (!feedError) feedFunctionAvailable = true;
    }
    if (feedError && !isMissingFeedFunction(feedError)) throw feedError;
    const feedRows = feedFunctionAvailable === false
      ? await getFallbackFeedRows(query, offset, limit)
      : (feedData ?? []) as FeedPositionRow[];
    if (!feedRows.length) {
      return { items: [], hasMore: false, nextCursor: null };
    }

    const clipIds = feedRows.map((row) => row.clip_id);
    const { data, error } = await supabase.from("clips").select(`
      id,vendor_id,category_id,title,caption,video_url,thumbnail_url,
      duration_seconds,width,height,file_size_bytes,cloudinary_public_id,
      views_count,likes_count,saves_count,status,visibility,
      created_at,updated_at,published_at,deleted_at,
      categories(name),
      vendors!clips_vendor_id_fkey(
        id,business_name,city,logo_url,contact_phone,contact_email,is_verified,
        categories(name)
      )
    `)
      .eq("status", "approved").eq("visibility", "public").is("deleted_at", null)
      .in("id", clipIds);
    if (error) throw error;
    const rowsById = new Map((data ?? []).map((row: any) => [row.id as string, row]));
    const rows = clipIds.map((id) => rowsById.get(id)).filter(Boolean) as any[];
    const vendorIds = [...new Set(rows.map((row) => row.vendor_id as string))];
    const summaries = vendorIds.length ? await listReviewSummaries(vendorIds) : {};
    const items = rows.map((row): PublicClip => {
      const vendor = one<any>(row.vendors) ?? {};
      const clipCategory = one<any>(row.categories)?.name ?? "Wedding";
      const summary = summaries[row.vendor_id];
      return {
        id: row.id, vendorId: row.vendor_id, categoryId: row.category_id,
        title: row.title, caption: row.caption, videoUrl: row.video_url,
        thumbnailUrl: row.thumbnail_url, durationSeconds: Number(row.duration_seconds),
        resolution: { width: Number(row.width), height: Number(row.height) },
        fileSizeBytes: Number(row.file_size_bytes), cloudinaryPublicId: row.cloudinary_public_id,
        viewsCount: Number(row.views_count), likesCount: Number(row.likes_count),
        savesCount: Number(row.saves_count), status: row.status, visibility: row.visibility,
        createdAt: row.created_at, updatedAt: row.updated_at, publishedAt: row.published_at,
        deletedAt: row.deleted_at, categoryName: clipCategory, hashtags: hashtags(row.caption),
        vendor: {
          id: vendor.id, name: vendor.business_name || "RoyalLagn Vendor",
          city: vendor.city || "", avatarUrl: vendor.logo_url,
          contactPhone: vendor.contact_phone, contactEmail: vendor.contact_email,
          verified: Boolean(vendor.is_verified),
          categoryName: one<any>(vendor.categories)?.name ?? clipCategory,
          rating: Number(summary?.average_rating ?? 0),
          reviewCount: Number(summary?.review_count ?? 0),
        },
      };
    });
    const nextOffset = offset + feedRows.length;
    const totalCount = Number(feedRows[0]?.total_count ?? nextOffset);
    const hasMore = nextOffset < totalCount;
    const result: PublicClipPage = {
      items,
      hasMore,
      nextCursor: hasMore ? { offset: nextOffset } : null,
    };
    ClipCacheService.set("feed", cacheId, result, CLIP_FEED_SETTINGS.cacheTtlMs);
    return result;
  },
};
