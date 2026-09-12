import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/services/supabase";
import {
  deleteReview,
  getMyReview,
  getReviewSummary,
  listReviews,
  resolveReviewVendor,
  saveReview,
  subscribeToVendorReviews,
  toggleReviewHelpful,
  type ReviewSort as ServiceReviewSort,
  type ReviewSummary as ServiceReviewSummary,
  type StarRating,
  type VendorReview,
} from "@/services/reviews";
import {
  deleteReviewPhoto,
  reviewPhotoPublicId,
} from "@/services/cloudinary";
import { useReviewRatings } from "@/context/ReviewRatingsContext";
import VendorReviewsSection from "./VendorReviewsSection";
import type {
  Review,
  ReviewDraft,
  ReviewSort,
  StarCounts,
  StarFilter,
} from "./types";

const PAGE_SIZE = 8;
const SORT_TO_SERVICE: Record<ReviewSort, ServiceReviewSort> = {
  recent: "most_recent",
  highest: "highest_rated",
  lowest: "lowest_rated",
  helpful: "most_helpful",
};

const EMPTY_SUMMARY: ServiceReviewSummary = {
  vendor_key: "",
  average_rating: 0,
  review_count: 0,
  rating_1_count: 0,
  rating_2_count: 0,
  rating_3_count: 0,
  rating_4_count: 0,
  rating_5_count: 0,
};

function toUiReview(review: VendorReview): Review {
  return {
    id: review.id,
    customerId: review.profile_id,
    customerName: review.customer_name,
    customerAvatar: review.customer_profile_image,
    verifiedCustomer: review.is_verified_customer,
    rating: review.rating,
    title: review.title,
    text: review.review,
    photos: review.image_urls,
    createdAt: review.created_at,
    updatedAt: review.updated_at,
    helpfulCount: review.helpful_count,
    isHelpful: review.viewer_has_voted,
    isOwner: review.is_owner,
    status: review.status,
  };
}

export default function ConnectedVendorReviews({
  vendorKey,
  vendorSlug,
  dark,
}: {
  vendorKey: string;
  vendorSlug: string;
  dark: boolean;
}) {
  const router = useRouter();
  const { setSummary } = useReviewRatings();
  const [summary, setLocalSummary] = useState<ServiceReviewSummary>({
    ...EMPTY_SUMMARY,
    vendor_key: vendorKey,
  });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [starFilter, setStarFilter] = useState<StarFilter>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [reviewPhotos, setReviewPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const originalPhotos = useRef<string[]>([]);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (nextPage = 0, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const resolved = await resolveReviewVendor(vendorKey);
      if (!resolved) throw new Error("Reviews are not configured for this vendor yet.");
      const [nextSummary, nextPageData] = await Promise.all([
        getReviewSummary(resolved.vendor_key),
        listReviews(resolved.vendor_key, {
          sort: SORT_TO_SERVICE[sort],
          star: starFilter,
          page: nextPage,
          pageSize: PAGE_SIZE,
        }),
      ]);
      setLocalSummary(nextSummary);
      setSummary(nextSummary);
      const mapped = nextPageData.reviews.map(toUiReview);
      setReviews((current) => (append ? [...current, ...mapped] : mapped));
      setHasMore(nextPageData.hasMore);
      setPage(nextPage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load reviews.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [setSummary, sort, starFilter, vendorKey]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthenticated(Boolean(data.user)));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session?.user));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToVendorReviews(vendorKey, () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => void load(), 90);
    });
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      unsubscribe();
    };
  }, [load, vendorKey]);

  const beginReview = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      const loginRoute = {
        pathname: "/DashboardCenter" as const,
        params: { returnTo: `/vendor/${encodeURIComponent(vendorSlug)}` },
      };
      if (Platform.OS === "web") {
        router.push(loginRoute);
        return;
      }
      Alert.alert("Sign in required", "Please sign in as a customer to write a review.", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign In", onPress: () => router.push(loginRoute) },
      ]);
      return;
    }
    try {
      const existing = await getMyReview(vendorKey);
      const mapped = existing ? toUiReview({ ...existing, is_owner: true }) : null;
      setEditingReview(mapped);
      const photos = existing?.image_urls ?? [];
      originalPhotos.current = photos;
      setReviewPhotos(photos);
      setFormError(null);
      setShowForm(true);
    } catch (caught) {
      Alert.alert("Unable to review", caught instanceof Error ? caught.message : "Please try again.");
    }
  }, [router, vendorKey, vendorSlug]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingReview(null);
    setReviewPhotos([]);
    setFormError(null);
  }, []);

  const submitReview = useCallback(async (draft: ReviewDraft) => {
    setSubmitting(true);
    setFormError(null);
    try {
      await saveReview(vendorKey, {
        rating: draft.rating as StarRating,
        title: draft.title,
        text: draft.text,
        imageUrls: reviewPhotos,
      });
      const removed = originalPhotos.current.filter((url) => !reviewPhotos.includes(url));
      await Promise.all(
        removed.map((url) => {
          const publicId = reviewPhotoPublicId(url);
          // The saved review no longer references removed photos. Ownership is
          // still enforced by the user's Bunny folder prefix server-side.
          return publicId ? deleteReviewPhoto(publicId) : Promise.resolve();
        })
      );
      setShowForm(false);
      setEditingReview(null);
      setReviewPhotos([]);
      await load();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : "Unable to save your review.");
    } finally {
      setSubmitting(false);
    }
  }, [load, reviewPhotos, vendorKey]);

  const editReview = useCallback((review: Review) => {
    setEditingReview(review);
    const photos = (review.photos ?? []).filter((item): item is string => typeof item === "string");
    originalPhotos.current = photos;
    setReviewPhotos(photos);
    setFormError(null);
    setShowForm(true);
  }, []);

  const removeReview = useCallback((review: Review) => {
    Alert.alert("Delete review?", "Your rating, text, and review photos will be permanently removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const photos = (review.photos ?? []).filter((item): item is string => typeof item === "string");
            await Promise.all(photos.map((url) => {
              const publicId = reviewPhotoPublicId(url);
              return publicId ? deleteReviewPhoto(publicId, review.id) : Promise.resolve();
            }));
            await deleteReview(review.id);
            await load();
          } catch (caught) {
            Alert.alert("Unable to delete", caught instanceof Error ? caught.message : "Please try again.");
          }
        },
      },
    ]);
  }, [load]);

  const helpful = useCallback(async (review: Review) => {
    if (!authenticated) {
      Alert.alert("Sign in required", "Please sign in to mark reviews as helpful.");
      return;
    }
    try {
      await toggleReviewHelpful(review.id);
      await load();
    } catch (caught) {
      Alert.alert("Unable to update", caught instanceof Error ? caught.message : "Please try again.");
    }
  }, [authenticated, load]);

  const counts = useMemo<StarCounts>(() => ({
    1: summary.rating_1_count,
    2: summary.rating_2_count,
    3: summary.rating_3_count,
    4: summary.rating_4_count,
    5: summary.rating_5_count,
  }), [summary]);

  return (
    <VendorReviewsSection
      average={summary.average_rating}
      total={summary.review_count}
      counts={counts}
      reviews={reviews}
      sort={sort}
      starFilter={starFilter}
      dark={dark}
      loading={loading}
      loadingMore={loadingMore}
      hasMore={hasMore}
      error={error}
      showForm={showForm}
      editingReview={editingReview}
      submitting={submitting}
      formError={formError}
      reviewPhotos={reviewPhotos}
      canWriteReview
      onWriteReview={beginReview}
      onCloseForm={closeForm}
      onSubmitReview={submitReview}
      onSortChange={setSort}
      onStarFilterChange={setStarFilter}
      onHelpful={helpful}
      onEdit={editReview}
      onDelete={removeReview}
      onLoadMore={() => void load(page + 1, true)}
      onRetry={() => void load()}
    />
  );
}
