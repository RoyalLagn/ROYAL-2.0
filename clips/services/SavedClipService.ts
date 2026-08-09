import { supabase } from "@/services/supabase";
import type { PublicClip } from "../types";

export type SavedClipItem = { clip: PublicClip; savedAt: string };
export type SavedClipPage = { items: SavedClipItem[]; nextCursor: string | null; hasMore: boolean };
type SaveListener = (event: { clipId: string; saved: boolean }) => void;

const listeners = new Set<SaveListener>();
let viewerHandoff: PublicClip | null = null;

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function mapClip(row: any): PublicClip {
  const vendor = one<any>(row.vendors) ?? {};
  const categoryName = one<any>(row.categories)?.name ?? "Wedding";
  return {
    id: row.id,
    vendorId: row.vendor_id,
    categoryId: row.category_id,
    title: row.title,
    caption: row.caption,
    videoUrl: row.video_url,
    thumbnailUrl: row.thumbnail_url,
    durationSeconds: Number(row.duration_seconds),
    resolution: { width: Number(row.width), height: Number(row.height) },
    fileSizeBytes: Number(row.file_size_bytes),
    cloudinaryPublicId: row.cloudinary_public_id,
    viewsCount: Number(row.views_count),
    likesCount: Number(row.likes_count),
    savesCount: Number(row.saves_count),
    status: row.status,
    visibility: row.visibility,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
    deletedAt: row.deleted_at,
    categoryName,
    hashtags: row.caption?.match(/#[\p{L}\p{N}_]+/gu)?.slice(0, 8) ?? [],
    vendor: {
      id: vendor.id,
      name: vendor.business_name || "RoyalLagn Vendor",
      city: vendor.city || "",
      avatarUrl: vendor.logo_url,
      contactPhone: vendor.contact_phone,
      contactEmail: vendor.contact_email,
      verified: Boolean(vendor.is_verified),
      categoryName: one<any>(vendor.categories)?.name ?? categoryName,
      rating: 0,
      reviewCount: 0,
    },
  };
}

export const SavedClipEvents = {
  subscribe(listener: SaveListener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  emit(clipId: string, saved: boolean) {
    listeners.forEach((listener) => listener({ clipId, saved }));
  },
};

export const ClipViewerHandoff = {
  set(clip: PublicClip) { viewerHandoff = clip; },
  consume(clipId: string) {
    if (viewerHandoff?.id !== clipId) return null;
    const clip = viewerHandoff;
    viewerHandoff = null;
    return clip;
  },
};

export const SavedClipService = {
  async list(profileId: string, cursor?: string | null, limit = 18): Promise<SavedClipPage> {
    let request = supabase.from("clip_saves").select(`
      clip_id,created_at,
      clips!clip_saves_clip_id_fkey(
        id,vendor_id,category_id,title,caption,video_url,thumbnail_url,
        duration_seconds,width,height,file_size_bytes,cloudinary_public_id,
        views_count,likes_count,saves_count,status,visibility,subscription_locked,
        created_at,updated_at,published_at,deleted_at,
        categories(name),
        vendors!clips_vendor_id_fkey(
          id,business_name,city,logo_url,contact_phone,contact_email,is_verified,
          categories(name)
        )
      )
    `)
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);
    if (cursor) request = request.lt("created_at", cursor);
    const { data, error } = await request;
    if (error) throw error;
    const rows = (data ?? []).filter((row: any) => {
      const clip = one<any>(row.clips);
      return clip?.status === "approved" && clip.visibility === "public" && !clip.subscription_locked && !clip.deleted_at;
    });
    const pageRows = rows.slice(0, limit);
    return {
      items: pageRows.map((row: any) => ({
        clip: mapClip(one<any>(row.clips)),
        savedAt: row.created_at,
      })),
      hasMore: rows.length > limit,
      nextCursor: rows.length > limit ? pageRows.at(-1)?.created_at ?? null : null,
    };
  },
};
