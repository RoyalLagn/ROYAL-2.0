import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

let reviewChannelSequence = 0;

export type ReviewStatus = "published" | "pending" | "rejected";
export type ReviewSort =
  | "most_recent"
  | "highest_rated"
  | "lowest_rated"
  | "most_helpful";
export type StarRating = 1 | 2 | 3 | 4 | 5;

export type ReviewVendorCatalog = {
  vendor_key: string;
  vendor_id: string | null;
  display_name: string;
  is_active: boolean;
};

export type VendorReview = {
  id: string;
  vendor_key: string;
  vendor_id: string | null;
  profile_id: string;
  rating: StarRating;
  title: string;
  review: string;
  image_urls: string[];
  status: ReviewStatus;
  helpful_count: number;
  is_verified_customer: boolean;
  created_at: string;
  updated_at: string;
  customer_name: string;
  customer_profile_image: string | null;
  viewer_has_voted: boolean;
  is_owner: boolean;
};

export type ReviewSummary = {
  vendor_key: string;
  average_rating: number;
  review_count: number;
  rating_1_count: number;
  rating_2_count: number;
  rating_3_count: number;
  rating_4_count: number;
  rating_5_count: number;
};

export type ReviewPage = {
  reviews: VendorReview[];
  total: number;
  hasMore: boolean;
};

export type ReviewListOptions = {
  sort?: ReviewSort;
  star?: StarRating | null;
  page?: number;
  pageSize?: number;
};

export type ReviewInput = {
  rating: StarRating;
  title: string;
  text: string;
  imageUrls?: string[];
};

function assertRating(rating: number): asserts rating is StarRating {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error("Rating must be a whole number from 1 to 5.");
  }
}

function cleanRequired(value: string, label: string, maxLength: number) {
  const cleaned = value.replace(/\0/g, "").trim();
  if (!cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function normalizeReview(row: Record<string, unknown>): VendorReview {
  const profile =
    row.profile && typeof row.profile === "object"
      ? (row.profile as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    vendor_key: String(row.vendor_key),
    vendor_id: row.vendor_id ? String(row.vendor_id) : null,
    profile_id: String(row.profile_id),
    rating: Number(row.rating) as StarRating,
    title: String(row.title ?? ""),
    review: String(row.review ?? ""),
    image_urls: Array.isArray(row.image_urls)
      ? row.image_urls.filter((url): url is string => typeof url === "string")
      : [],
    status: String(row.status ?? "published") as ReviewStatus,
    helpful_count: Number(row.helpful_count ?? 0),
    is_verified_customer: Boolean(row.is_verified_customer),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at ?? row.created_at),
    customer_name: String(
      row.customer_name ?? profile.full_name ?? "RoyalLagn customer"
    ),
    customer_profile_image:
      (row.customer_profile_image ?? profile.profile_image) as string | null,
    viewer_has_voted: Boolean(row.viewer_has_voted),
    is_owner: Boolean(row.is_owner),
  };
}

/**
 * Resolves either a static listing key (for example `c1`) or a database UUID
 * to the stable key used by the review subsystem.
 */
export async function resolveReviewVendor(
  vendorReference: string
): Promise<ReviewVendorCatalog | null> {
  const reference = vendorReference.trim();
  if (!reference) return null;
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      reference
    );
  let query = supabase
    .from("review_vendor_catalog")
    .select("vendor_key,vendor_id,display_name,is_active")
    .eq("is_active", true);
  query = uuidLike
    ? query.or(`vendor_key.eq.${reference},vendor_id.eq.${reference}`)
    : query.eq("vendor_key", reference);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return (data as ReviewVendorCatalog | null) ?? null;
}

export async function getReviewSummary(
  vendorKey: string
): Promise<ReviewSummary> {
  const { data, error } = await supabase.rpc("get_vendor_review_summary", {
    target_vendor_key: vendorKey,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | Partial<ReviewSummary>
    | null;
  return {
    vendor_key: vendorKey,
    average_rating: Number(row?.average_rating ?? 0),
    review_count: Number(row?.review_count ?? 0),
    rating_1_count: Number(row?.rating_1_count ?? 0),
    rating_2_count: Number(row?.rating_2_count ?? 0),
    rating_3_count: Number(row?.rating_3_count ?? 0),
    rating_4_count: Number(row?.rating_4_count ?? 0),
    rating_5_count: Number(row?.rating_5_count ?? 0),
  };
}

export async function listReviewSummaries(
  vendorKeys?: string[]
): Promise<Record<string, ReviewSummary>> {
  let query = supabase.from("review_aggregates").select("*");
  if (vendorKeys?.length) query = query.in("vendor_key", vendorKeys);
  const { data, error } = await query;
  if (error) throw error;
  return Object.fromEntries(
    ((data ?? []) as Partial<ReviewSummary>[]).map((row) => {
      const summary: ReviewSummary = {
        vendor_key: String(row.vendor_key),
        average_rating: Number(row.average_rating ?? 0),
        review_count: Number(row.review_count ?? 0),
        rating_1_count: Number(row.rating_1_count ?? 0),
        rating_2_count: Number(row.rating_2_count ?? 0),
        rating_3_count: Number(row.rating_3_count ?? 0),
        rating_4_count: Number(row.rating_4_count ?? 0),
        rating_5_count: Number(row.rating_5_count ?? 0),
      };
      return [summary.vendor_key, summary];
    })
  );
}

export async function listReviews(
  vendorKey: string,
  options: ReviewListOptions = {}
): Promise<ReviewPage> {
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 10));
  const page = Math.max(0, options.page ?? 0);
  const { data, error } = await supabase.rpc("list_vendor_reviews", {
    target_vendor_key: vendorKey,
    sort_by: options.sort ?? "most_recent",
    star_filter: options.star ?? null,
    page_size: pageSize,
    page_offset: page * pageSize,
  });
  if (error) throw error;
  const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  const total = Number(rows[0]?.total_count ?? rows.length);
  return {
    reviews: rows.map(normalizeReview),
    total,
    hasMore: (page + 1) * pageSize < total,
  };
}

export async function getMyReview(
  vendorKey: string
): Promise<VendorReview | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) return null;
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("vendor_key", vendorKey)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeReview(data as Record<string, unknown>) : null;
}

export async function saveReview(
  vendorKey: string,
  input: ReviewInput
): Promise<VendorReview> {
  assertRating(input.rating);
  const title = cleanRequired(input.title, "Review title", 120);
  const review = cleanRequired(input.text, "Review", 5000);
  const imageUrls = (input.imageUrls ?? []).slice(0, 6);
  if (imageUrls.some((url) => !/^https:\/\/(?:res\.cloudinary\.com|royallagnmedia\.b-cdn\.net)\//i.test(url))) {
    throw new Error("Review photos must be secure managed-media URLs.");
  }
  const { data, error } = await supabase.rpc("upsert_vendor_review", {
    target_vendor_key: vendorKey,
    rating: input.rating,
    title,
    review,
    image_urls: imageUrls,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown>;
  return normalizeReview(row);
}

export async function deleteReview(reviewId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_own_review", {
    target_review_id: reviewId,
  });
  if (error) throw error;
}

export async function toggleReviewHelpful(reviewId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("toggle_review_helpful", {
    target_review_id: reviewId,
  });
  if (error) throw error;
  return Boolean(Array.isArray(data) ? data[0] : data);
}

/**
 * Review rows and their aggregate row are both watched because aggregate
 * updates may be committed by a trigger after the review change.
 */
export function subscribeToVendorReviews(
  vendorKey: string,
  onChange: () => void
): () => void {
  let queued = false;
  const notify = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      onChange();
    });
  };
  reviewChannelSequence += 1;
  const channel: RealtimeChannel = supabase
    .channel(`vendor-reviews:${vendorKey}:${reviewChannelSequence}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "reviews",
        filter: `vendor_key=eq.${vendorKey}`,
      },
      notify
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "review_aggregates",
        filter: `vendor_key=eq.${vendorKey}`,
      },
      notify
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeToReviewAggregates(
  onChange: (summary: ReviewSummary) => void
): () => void {
  reviewChannelSequence += 1;
  const channel = supabase
    .channel(`review-aggregates:all:${reviewChannelSequence}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "review_aggregates" },
      (event) => {
        const row = (event.new || event.old) as Partial<ReviewSummary>;
        if (!row.vendor_key) return;
        onChange({
          vendor_key: String(row.vendor_key),
          average_rating: Number(row.average_rating ?? 0),
          review_count: Number(row.review_count ?? 0),
          rating_1_count: Number(row.rating_1_count ?? 0),
          rating_2_count: Number(row.rating_2_count ?? 0),
          rating_3_count: Number(row.rating_3_count ?? 0),
          rating_4_count: Number(row.rating_4_count ?? 0),
          rating_5_count: Number(row.rating_5_count ?? 0),
        });
      }
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
