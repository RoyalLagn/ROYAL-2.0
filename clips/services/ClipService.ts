import { supabase } from "@/services/supabase";
import { CLIP_PAGINATION } from "../constants";
import type { ClipCursor } from "../types";

export interface ListClipsQuery {
  vendorId?: string;
  categoryId?: string;
  cursor?: ClipCursor | null;
  limit?: number;
}

export const ClipService = {
  async list(query: ListClipsQuery = {}) {
    const limit = Math.min(
      Math.max(query.limit ?? CLIP_PAGINATION.defaultPageSize, 1),
      CLIP_PAGINATION.maximumPageSize,
    );
    let request = supabase
      .from("clips")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(limit + 1);
    if (query.vendorId) request = request.eq("vendor_id", query.vendorId);
    if (query.categoryId) request = request.eq("category_id", query.categoryId);
    if (query.cursor) request = request.or(
      `created_at.lt.${query.cursor.createdAt},and(created_at.eq.${query.cursor.createdAt},id.lt.${query.cursor.id})`,
    );
    return request;
  },
  getById(id: string) {
    return supabase.from("clips").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  },
};
