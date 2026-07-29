import { supabase } from "@/services/supabase";
import { listReviewSummaries } from "@/services/reviews";
import { CLIP_FEED_SETTINGS, CLIP_PAGINATION } from "../constants";
import type { ClipCursor, PublicClip, PublicClipPage } from "../types";
import { ClipCacheService } from "./ClipCacheService";

export interface PublicClipQuery {
  categoryId?: string | null;
  cursor?: ClipCursor | null;
  limit?: number;
}

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function hashtags(caption?: string | null) {
  return caption?.match(/#[\p{L}\p{N}_]+/gu)?.slice(0, 8) ?? [];
}

export const PublicClipService = {
  async list(query: PublicClipQuery = {}): Promise<PublicClipPage> {
    const limit = Math.min(Math.max(query.limit ?? CLIP_PAGINATION.defaultPageSize, 1), CLIP_PAGINATION.maximumPageSize);
    const cacheId = `${query.categoryId || "all"}:${query.cursor?.createdAt || "start"}:${query.cursor?.id || ""}:${limit}`;
    const cached = ClipCacheService.get<PublicClipPage>("feed", cacheId);
    if (cached) return cached;

    let request = supabase.from("clips").select(`
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
      .order("published_at", { ascending: false }).order("id", { ascending: false })
      .limit(limit + 1);
    if (query.categoryId) request = request.eq("category_id", query.categoryId);
    if (query.cursor) {
      request = request.or(
        `published_at.lt.${query.cursor.createdAt},and(published_at.eq.${query.cursor.createdAt},id.lt.${query.cursor.id})`,
      );
    }
    const { data, error } = await request;
    if (error) throw error;
    const rows = (data ?? []).slice(0, limit) as any[];
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
    const last = items.at(-1);
    const result: PublicClipPage = {
      items, hasMore: (data?.length ?? 0) > limit,
      nextCursor: last?.publishedAt ? { createdAt: last.publishedAt, id: last.id } : null,
    };
    ClipCacheService.set("feed", cacheId, result, CLIP_FEED_SETTINGS.cacheTtlMs);
    return result;
  },
};
