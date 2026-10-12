import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Filter,
  Image as ImageIcon,
  MessageSquare,
  RefreshCw,
  Share2,
  Star,
  ThumbsUp,
  X,
} from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { brandPalette } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";
import {
  getReviewSummary,
  listReviews,
  subscribeToVendorReviews,
  type ReviewSort as ServiceReviewSort,
  type ReviewSummary,
  type StarRating,
  type VendorReview,
} from "@/services/reviews";
import type { Review, ReviewSort, StarCounts, StarFilter } from "@/components/reviews/types";
import { reviewPalette } from "@/components/reviews/types";

const PAGE_SIZE = 10;
const SORT_TO_SERVICE: Record<ReviewSort, ServiceReviewSort> = {
  recent: "most_recent",
  highest: "highest_rated",
  lowest: "lowest_rated",
  helpful: "most_helpful",
};

const SORT_OPTIONS: { key: ReviewSort; label: string }[] = [
  { key: "recent", label: "Most Recent" },
  { key: "highest", label: "Highest Rated" },
  { key: "lowest", label: "Lowest Rated" },
  { key: "helpful", label: "Most Helpful" },
];

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

const formatDate = (value: string | Date) => {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
};

export interface VendorCrmReviewsSectionProps {
  vendorId?: string;
  vendorSlug?: string;
  businessName?: string;
}

export default function VendorCrmReviewsSection({
  vendorId,
  vendorSlug,
  businessName,
}: VendorCrmReviewsSectionProps) {
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const isDesktop = width >= 900;
  const isSmall = width < 420;

  const c = reviewPalette(isDark);
  const publicUrl = vendorSlug ? `https://royallagn.com/vendor/${vendorSlug}` : null;

  const [summary, setSummary] = useState<ReviewSummary>({
    vendor_key: vendorId ?? "",
    average_rating: 0,
    review_count: 0,
    rating_1_count: 0,
    rating_2_count: 0,
    rating_3_count: 0,
    rating_4_count: 0,
    rating_5_count: 0,
  });

  const [reviews, setReviews] = useState<Review[]>([]);
  const [sort, setSort] = useState<ReviewSort>("recent");
  const [starFilter, setStarFilter] = useState<StarFilter>(null);
  const [page, setPage] = useState(0);
  const [totalFilteredCount, setTotalFilteredCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reviewsSectionRef = useRef<View>(null);

  const loadData = useCallback(
    async (nextPage = 0, isSilent = false) => {
      if (!vendorId) {
        setLoading(false);
        return;
      }
      if (!isSilent) setLoading(true);

      setError(null);
      try {
        const [nextSummary, nextPageData] = await Promise.all([
          getReviewSummary(vendorId),
          listReviews(vendorId, {
            sort: SORT_TO_SERVICE[sort],
            star: starFilter,
            page: nextPage,
            pageSize: PAGE_SIZE,
          }),
        ]);

        setSummary(nextSummary);
        const mapped = nextPageData.reviews.map(toUiReview);
        setReviews(mapped);
        setTotalFilteredCount(nextPageData.total);
        setHasMore(nextPageData.hasMore);
        setPage(nextPage);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Unable to load customer reviews.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [sort, starFilter, vendorId]
  );

  useEffect(() => {
    void loadData(0, false);
  }, [loadData]);

  // Real-time synchronization: when public reviews are posted, updated or removed
  useEffect(() => {
    if (!vendorId) return;

    const unsubscribe = subscribeToVendorReviews(vendorId, () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void loadData(page, true);
      }, 100);
    });

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      unsubscribe();
    };
  }, [loadData, page, vendorId]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    void loadData(page, false);
  };

  const handleCopyLink = async () => {
    if (!publicUrl) return;
    await Clipboard.setStringAsync(publicUrl);
    Alert.alert("Link Copied", "Your public profile link was copied to clipboard. Share it with clients to collect reviews!");
  };

  const roundedRating = Math.max(0, Math.min(5, Math.round(summary.average_rating)));
  const total = summary.review_count;

  const starCounts: StarCounts = useMemo(
    () => ({
      1: summary.rating_1_count,
      2: summary.rating_2_count,
      3: summary.rating_3_count,
      4: summary.rating_4_count,
      5: summary.rating_5_count,
    }),
    [summary]
  );

  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / PAGE_SIZE));
  const startIndex = totalFilteredCount === 0 ? 0 : page * PAGE_SIZE + 1;
  const endIndex = Math.min((page + 1) * PAGE_SIZE, totalFilteredCount);

  const handlePageChange = (newPage: number) => {
    if (newPage < 0 || newPage >= totalPages || newPage === page || loading) return;
    void loadData(newPage, false);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        (reviewsSectionRef.current as any)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
      } catch {}
    }
  };

  const renderPagePills = () => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }).map((_, idx) => {
        const isActive = page === idx;
        return (
          <Pressable
            key={idx}
            accessibilityRole="button"
            accessibilityLabel={`Page ${idx + 1}`}
            onPress={() => handlePageChange(idx)}
            style={({ pressed, hovered }: any) => [
              styles.pageNumberBtn,
              isActive && styles.pageNumberBtnActive,
              isDark && styles.pageNumberBtnDark,
              isDark && isActive && styles.pageNumberBtnActiveDark,
              hovered && !isActive && styles.pageNumberBtnHovered,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.pageNumberText,
                isDark && styles.textDark,
                isActive && styles.pageNumberTextActive,
              ]}
            >
              {idx + 1}
            </Text>
          </Pressable>
        );
      });
    }

    const items: (number | "dots-left" | "dots-right")[] = [];
    items.push(0);

    const start = Math.max(1, page - 1);
    const end = Math.min(totalPages - 2, page + 1);

    if (start > 1) {
      items.push("dots-left");
    }

    for (let i = start; i <= end; i++) {
      items.push(i);
    }

    if (end < totalPages - 2) {
      items.push("dots-right");
    }

    items.push(totalPages - 1);

    return items.map((item, idx) => {
      if (typeof item === "string") {
        return (
          <View key={item + idx} style={styles.dotsWrap}>
            <Text style={[styles.dotsText, isDark && styles.textMutedDark]}>…</Text>
          </View>
        );
      }
      const isActive = page === item;
      return (
        <Pressable
          key={item}
          accessibilityRole="button"
          accessibilityLabel={`Page ${item + 1}`}
          onPress={() => handlePageChange(item)}
          style={({ pressed, hovered }: any) => [
            styles.pageNumberBtn,
            isActive && styles.pageNumberBtnActive,
            isDark && styles.pageNumberBtnDark,
            isDark && isActive && styles.pageNumberBtnActiveDark,
            hovered && !isActive && styles.pageNumberBtnHovered,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.pageNumberText,
              isDark && styles.textDark,
              isActive && styles.pageNumberTextActive,
            ]}
          >
            {item + 1}
          </Text>
        </Pressable>
      );
    });
  };

  return (
    <View ref={reviewsSectionRef} style={[styles.card, isDark && styles.cardDark]}>
      {/* Header with Title and Live Badge */}
      <View style={styles.headerRow}>
        <View style={styles.titleWrap}>
          <View style={[styles.iconBox, { backgroundColor: isDark ? "#3B2F1F" : "#FEF3C7" }]}>
            <Star size={18} color="#E8A52F" fill="#E8A52F" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.titleLine}>
              <Text numberOfLines={2} style={[styles.cardTitle, isDark && styles.textDark]}>
                Customer Reviews & Ratings
              </Text>
              <View style={[styles.liveBadge, { backgroundColor: isDark ? "#064E3B" : "#ECFDF5", borderColor: isDark ? "#047857" : "#A7F3D0" }]}>
                <View style={styles.liveDot} />
                <Text style={[styles.liveText, { color: isDark ? "#34D399" : "#059669" }]}>Live Realtime</Text>
              </View>
            </View>
            <Text numberOfLines={2} style={[styles.cardSubtitle, isDark && styles.textMutedDark]}>
              Reviews and star ratings submitted by verified customers on RoyalLagn
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh reviews"
            onPress={handleManualRefresh}
            style={({ pressed, hovered }: any) => [
              styles.iconBtn,
              isDark && styles.iconBtnDark,
              hovered && styles.iconBtnHovered,
              pressed && styles.pressed,
            ]}
          >
            <RefreshCw
              size={16}
              color={isDark ? "#D1D5DB" : "#4B5563"}
              style={refreshing ? { transform: [{ rotate: "180deg" }] } : undefined}
            />
          </Pressable>

          {publicUrl ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Copy public profile link"
              onPress={handleCopyLink}
              style={({ pressed, hovered }: any) => [
                styles.shareBtn,
                hovered && styles.shareBtnHovered,
                pressed && styles.pressed,
              ]}
            >
              <Copy size={14} color="#E11D48" />
              {!isSmall ? <Text style={styles.shareBtnText}>Share Link</Text> : null}
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Overview Box: Score on Left + Star Distribution on Right */}
      <View style={[styles.scoreOverview, isDark && styles.scoreOverviewDark]}>
        {/* Score Block */}
        <View style={styles.scoreBlock}>
          <Text style={[styles.scoreValue, isDark && styles.textDark]}>
            {summary.average_rating > 0 ? summary.average_rating.toFixed(1) : "0.0"}
          </Text>
          <View style={styles.starsRow}>
            {"★".repeat(roundedRating).split("").map((_, i) => (
              <Text key={`active-${i}`} style={[styles.starChar, { color: "#E8A52F" }]}>★</Text>
            ))}
            {"★".repeat(5 - roundedRating).split("").map((_, i) => (
              <Text key={`inactive-${i}`} style={[styles.starChar, { color: isDark ? "#4B5563" : "#E5E7EB" }]}>★</Text>
            ))}
          </View>
          <Text style={[styles.scoreSub, isDark && styles.textMutedDark]}>
            {total === 0 ? "No ratings yet" : `Based on ${total} ${total === 1 ? "review" : "reviews"}`}
          </Text>
          {total > 0 && (
            <View style={[styles.satisfactionPill, isDark && styles.satisfactionPillDark]}>
              <CheckCircle2 size={12} color="#10B981" />
              <Text style={styles.satisfactionText}>
                {Math.round(((summary.rating_5_count + summary.rating_4_count) / Math.max(1, total)) * 100)}% 4★ or 5★
              </Text>
            </View>
          )}
        </View>

        {/* Distribution Bars */}
        <View style={styles.distBlock}>
          {([5, 4, 3, 2, 1] as const).map((starNum) => {
            const count = starCounts[starNum] || 0;
            const percent = total > 0 ? Math.round((count / total) * 100) : 0;
            const isSelected = starFilter === starNum;

            return (
              <Pressable
                key={starNum}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${starNum} star reviews`}
                onPress={() => setStarFilter(isSelected ? null : starNum)}
                style={({ pressed, hovered }: any) => [
                  styles.distRow,
                  isSelected && styles.distRowSelected,
                  isDark && isSelected && styles.distRowSelectedDark,
                  hovered && styles.distRowHovered,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.distLabel, isDark && styles.textMutedDark, isSelected && { color: "#E11D48", fontWeight: "700" }]}>
                  {starNum} ★
                </Text>
                <View style={[styles.distTrack, isDark && styles.distTrackDark]}>
                  <View
                    style={[
                      styles.distFill,
                      { width: `${percent}%` },
                      isSelected && { backgroundColor: "#E11D48" },
                    ]}
                  />
                </View>
                <Text style={[styles.distCount, isDark && styles.textMutedDark, isSelected && { color: "#E11D48", fontWeight: "700" }]}>
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Filter and Sort Chips */}
      <View style={styles.controlsRow}>
        {/* Star Rating Pills */}
        <ScrollView
          horizontal
          style={styles.chipScroller}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show all reviews"
            onPress={() => setStarFilter(null)}
            style={({ pressed }: any) => [
              styles.filterPill,
              starFilter === null && styles.filterPillActive,
              isDark && styles.filterPillDark,
              isDark && starFilter === null && styles.filterPillActiveDark,
                  pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.filterPillText,
                isDark && styles.textMutedDark,
                starFilter === null && styles.filterPillTextActive,
              ]}
            >
              All Stars ({total})
            </Text>
          </Pressable>

          {([5, 4, 3, 2, 1] as const).map((s) => {
            const count = starCounts[s] || 0;
            const active = starFilter === s;
            return (
              <Pressable
                key={s}
                accessibilityRole="button"
                accessibilityLabel={`Show ${s} star reviews`}
                onPress={() => setStarFilter(active ? null : s)}
                style={({ pressed }: any) => [
                  styles.filterPill,
                  active && styles.filterPillActive,
                  isDark && styles.filterPillDark,
                  isDark && active && styles.filterPillActiveDark,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    isDark && styles.textMutedDark,
                    active && styles.filterPillTextActive,
                  ]}
                >
                  {s} ★ ({count})
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Sort Options */}
        <ScrollView
          horizontal
          style={styles.chipScroller}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.sortScroll}
        >
          {SORT_OPTIONS.map((item) => {
            const active = sort === item.key;
            return (
              <Pressable
                key={item.key}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${item.label}`}
                onPress={() => setSort(item.key)}
                style={({ pressed }: any) => [
                  styles.sortPill,
                  active && styles.sortPillActive,
                  isDark && styles.sortPillDark,
                  isDark && active && styles.sortPillActiveDark,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.sortPillText,
                    isDark && styles.textMutedDark,
                    active && styles.sortPillTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Review Content Area */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#E11D48" />
          <Text style={[styles.loadingText, isDark && styles.textMutedDark]}>
            Loading customer reviews...
          </Text>
        </View>
      ) : error ? (
        <View style={[styles.errorBox, isDark && styles.errorBoxDark]}>
          <Text style={styles.errorTitle}>Unable to load reviews</Text>
          <Text style={[styles.errorDesc, isDark && styles.textMutedDark]}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void loadData(0, false)}
            style={styles.retryBtn}
          >
            <Text style={styles.retryBtnText}>Try Again</Text>
          </Pressable>
        </View>
      ) : reviews.length === 0 ? (
        <View style={[styles.emptyBox, isDark && styles.emptyBoxDark]}>
          <View style={[styles.emptyIconCircle, isDark && styles.emptyIconCircleDark]}>
            <MessageSquare size={28} color="#E11D48" />
          </View>
          <Text style={[styles.emptyTitle, isDark && styles.textDark]}>
            {starFilter ? `No ${starFilter}-star reviews found` : "No customer reviews yet"}
          </Text>
          <Text style={[styles.emptyDesc, isDark && styles.textMutedDark]}>
            {starFilter
              ? "Try selecting another star rating filter or tap 'All Stars'."
              : "When couples and wedding clients leave reviews on your public profile, they appear here in real-time."}
          </Text>
          {starFilter ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setStarFilter(null)}
              style={styles.clearFilterBtn}
            >
              <Text style={styles.clearFilterText}>Show All Reviews</Text>
            </Pressable>
          ) : publicUrl ? (
            <Pressable
              accessibilityRole="button"
              onPress={handleCopyLink}
              style={styles.copyLinkBtn}
            >
              <Copy size={15} color="#FFFFFF" />
              <Text style={styles.copyLinkText}>Copy Profile Link to Request Reviews</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.reviewList}>
          {reviews.map((rev) => {
            const initial = rev.customerName.trim().charAt(0).toUpperCase() || "C";
            return (
              <View
                key={rev.id}
                style={[styles.reviewCard, isDark && styles.reviewCardDark]}
              >
                {/* Author Info & Date */}
                <View style={styles.authorRow}>
                  {rev.customerAvatar ? (
                    <Image source={{ uri: String(rev.customerAvatar) }} style={styles.avatarImg} />
                  ) : (
                    <View style={[styles.avatarInitial, { backgroundColor: isDark ? "#374151" : "#FEE2E2" }]}>
                      <Text style={[styles.avatarInitialText, { color: isDark ? "#F472B6" : "#E11D48" }]}>
                        {initial}
                      </Text>
                    </View>
                  )}

                  <View style={styles.authorMeta}>
                    <Text numberOfLines={1} style={[styles.authorName, isDark && styles.textDark]}>
                      {rev.customerName}
                    </Text>
                    {rev.verifiedCustomer && (
                      <View style={styles.verifiedBadge}>
                        <CheckCircle2 size={11} color="#059669" />
                        <Text style={styles.verifiedBadgeText}>Verified Booking</Text>
                      </View>
                    )}
                  </View>

                  <Text style={[styles.reviewDate, isDark && styles.textMutedDark]}>
                    {formatDate(rev.createdAt)}
                  </Text>
                </View>

                {/* Stars Row */}
                <View style={styles.reviewStarsRow}>
                  {"★".repeat(rev.rating).split("").map((_, i) => (
                    <Text key={`rev-star-${i}`} style={[styles.reviewStarChar, { color: "#E8A52F" }]}>★</Text>
                  ))}
                  {"★".repeat(5 - rev.rating).split("").map((_, i) => (
                    <Text key={`rev-star-inact-${i}`} style={[styles.reviewStarChar, { color: isDark ? "#4B5563" : "#E5E7EB" }]}>★</Text>
                  ))}
                </View>

                {/* Title and Review Body */}
                {rev.title ? (
                  <Text style={[styles.reviewTitleText, isDark && styles.textDark]}>
                    {rev.title}
                  </Text>
                ) : null}
                <Text style={[styles.reviewBodyText, isDark && styles.textMutedDark]}>
                  {rev.text}
                </Text>

                {/* Photos */}
                {rev.photos && rev.photos.length > 0 ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.photosScroll}
                  >
                    {rev.photos.map((photoUri, pIdx) => (
                      <Pressable
                        key={pIdx}
                        accessibilityRole="button"
                        accessibilityLabel="View review photo"
                        onPress={() => setSelectedPhoto(String(photoUri))}
                        style={({ pressed }: any) => [
                          styles.photoThumbWrap,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Image source={{ uri: String(photoUri) }} style={styles.photoThumb} />
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}

                {/* Helpful count footer */}
                <View style={[styles.reviewFooter, isDark && styles.reviewFooterDark]}>
                  <View style={styles.helpfulPill}>
                    <ThumbsUp size={13} color={isDark ? "#9CA3AF" : "#6B7280"} />
                    <Text style={[styles.helpfulText, isDark && styles.textMutedDark]}>
                      {rev.helpfulCount} helpful {rev.helpfulCount === 1 ? "vote" : "votes"}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}

          {/* Pagination Controls after 10 reviews */}
          {totalFilteredCount > PAGE_SIZE && (
            <View style={[styles.paginationRow, isDark && styles.paginationRowDark]}>
              <View style={styles.paginationInfoWrap}>
                <Text style={[styles.paginationInfoText, isDark && styles.textMutedDark]}>
                  Showing{" "}
                  <Text style={[styles.paginationBold, isDark && styles.textDark]}>
                    {startIndex}–{endIndex}
                  </Text>{" "}
                  of{" "}
                  <Text style={[styles.paginationBold, isDark && styles.textDark]}>
                    {totalFilteredCount}
                  </Text>{" "}
                  reviews
                </Text>
              </View>

              <View style={styles.paginationControls}>
                {/* Previous Button */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous page"
                  disabled={page === 0 || loading}
                  onPress={() => handlePageChange(page - 1)}
                  style={({ pressed, hovered }: any) => [
                    styles.pageNavBtn,
                    isDark && styles.pageNavBtnDark,
                    (page === 0 || loading) && styles.pageNavBtnDisabled,
                    hovered && page !== 0 && !loading && styles.pageNavBtnHovered,
                    pressed && styles.pressed,
                  ]}
                >
                  <ChevronLeft
                    size={16}
                    color={
                      page === 0 || loading
                        ? isDark
                          ? "#4B5563"
                          : "#D1D5DB"
                        : isDark
                        ? "#F9FAFB"
                        : "#374151"
                    }
                  />
                  {!isSmall && (
                    <Text
                      style={[
                        styles.pageNavText,
                        (page === 0 || loading) && styles.pageNavTextDisabled,
                        isDark && styles.textDark,
                      ]}
                    >
                      Prev
                    </Text>
                  )}
                </Pressable>

                {/* Numbered Page Buttons */}
                <View style={styles.pageNumbersWrap}>
                  {renderPagePills()}
                </View>

                {/* Next Button */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next page"
                  disabled={page >= totalPages - 1 || loading}
                  onPress={() => handlePageChange(page + 1)}
                  style={({ pressed, hovered }: any) => [
                    styles.pageNavBtn,
                    isDark && styles.pageNavBtnDark,
                    (page >= totalPages - 1 || loading) && styles.pageNavBtnDisabled,
                    hovered && page < totalPages - 1 && !loading && styles.pageNavBtnHovered,
                    pressed && styles.pressed,
                  ]}
                >
                  {!isSmall && (
                    <Text
                      style={[
                        styles.pageNavText,
                        (page >= totalPages - 1 || loading) && styles.pageNavTextDisabled,
                        isDark && styles.textDark,
                      ]}
                    >
                      Next
                    </Text>
                  )}
                  <ChevronRight
                    size={16}
                    color={
                      page >= totalPages - 1 || loading
                        ? isDark
                          ? "#4B5563"
                          : "#D1D5DB"
                        : isDark
                        ? "#F9FAFB"
                        : "#374151"
                    }
                  />
                </Pressable>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Full Photo Modal Preview */}
      <Modal
        visible={Boolean(selectedPhoto)}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedPhoto(null)}
      >
        <View style={styles.photoModalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            onPress={() => setSelectedPhoto(null)}
            style={styles.closePhotoBtn}
          >
            <X size={24} color="#FFFFFF" />
          </Pressable>
          {selectedPhoto && (
            <Image
              source={{ uri: selectedPhoto }}
              style={styles.modalFullImage}
              resizeMode="contain"
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    padding: 20,
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box" as any,
  },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.92 },
  cardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
    minWidth: 0,
  },
  titleWrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  cardTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
    lineHeight: 16,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#10B981",
  },
  liveText: {
    fontSize: 11,
    fontWeight: "700",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnDark: {
    backgroundColor: "#374151",
  },
  iconBtnHovered: {
    backgroundColor: "#E5E7EB",
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#FFF1F2",
    borderWidth: 1,
    borderColor: "#FECDD3",
  },
  shareBtnHovered: {
    backgroundColor: "#FFE4E6",
  },
  shareBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#E11D48",
  },
  scoreOverview: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    padding: 16,
    gap: 20,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    marginBottom: 16,
  },
  scoreOverviewDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
  },
  scoreBlock: {
    alignItems: "flex-start",
    minWidth: 140,
    gap: 4,
  },
  scoreValue: {
    fontSize: 38,
    fontWeight: "900",
    color: "#111827",
    lineHeight: 44,
  },
  starsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  starChar: {
    fontSize: 18,
  },
  scoreSub: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  satisfactionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    marginTop: 6,
  },
  satisfactionPillDark: {
    backgroundColor: "#064E3B",
  },
  satisfactionText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
  },
  distBlock: {
    flex: 1,
    minWidth: 200,
    justifyContent: "center",
    gap: 6,
  },
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  distRowSelected: {
    backgroundColor: "#FFF1F2",
  },
  distRowSelectedDark: {
    backgroundColor: "#831843",
  },
  distRowHovered: {
    opacity: 0.85,
  },
  distLabel: {
    width: 32,
    fontSize: 12,
    fontWeight: "600",
    color: "#4B5563",
  },
  distTrack: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  distTrackDark: {
    backgroundColor: "#374151",
  },
  distFill: {
    height: "100%",
    backgroundColor: "#E8A52F",
    borderRadius: 4,
  },
  distCount: {
    width: 24,
    fontSize: 12,
    color: "#6B7280",
    textAlign: "right",
  },
  controlsRow: {
    width: "100%",
    minWidth: 0,
    gap: 12,
    marginBottom: 20,
  },
  chipScroller: {
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
  filterScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  filterPill: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  filterPillDark: {
    backgroundColor: "#374151",
    borderColor: "#4B5563",
  },
  filterPillActive: {
    backgroundColor: "#FFF1F2",
    borderColor: "#E11D48",
  },
  filterPillActiveDark: {
    backgroundColor: "#831843",
    borderColor: "#F472B6",
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4B5563",
  },
  filterPillTextActive: {
    color: "#E11D48",
    fontWeight: "700",
  },
  sortScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  sortPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sortPillDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  sortPillActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  sortPillActiveDark: {
    backgroundColor: "#F9FAFB",
    borderColor: "#F9FAFB",
  },
  sortPillText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#6B7280",
  },
  sortPillTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  loadingBox: {
    paddingVertical: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: "#6B7280",
  },
  errorBox: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    gap: 8,
  },
  errorBoxDark: {
    backgroundColor: "#7F1D1D",
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#DC2626",
  },
  errorDesc: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#DC2626",
  },
  retryBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  emptyBox: {
    padding: 32,
    borderRadius: 16,
    backgroundColor: "#FAFAFA",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyBoxDark: {
    backgroundColor: "#111827",
  },
  emptyIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#FFF1F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyIconCircleDark: {
    backgroundColor: "#831843",
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    maxWidth: 360,
    lineHeight: 18,
  },
  clearFilterBtn: {
    marginTop: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#E11D48",
  },
  copyLinkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#E11D48",
  },
  copyLinkText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  reviewList: {
    gap: 12,
  },
  reviewCard: {
    backgroundColor: "#FAFAFA",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    padding: 16,
    gap: 8,
  },
  reviewCardDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  avatarInitial: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitialText: {
    fontSize: 16,
    fontWeight: "700",
  },
  authorMeta: {
    flex: 1,
    minWidth: 0,
  },
  authorName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  verifiedBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#059669",
  },
  reviewDate: {
    flexShrink: 0,
    fontSize: 11,
    color: "#9CA3AF",
  },
  reviewStarsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  reviewStarChar: {
    fontSize: 15,
  },
  reviewTitleText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  reviewBodyText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#4B5563",
  },
  photosScroll: {
    gap: 8,
    paddingTop: 4,
  },
  photoThumbWrap: {
    borderRadius: 10,
    overflow: "hidden",
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
    backgroundColor: "#E5E7EB",
  },
  reviewFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
    marginTop: 4,
  },
  reviewFooterDark: {
    borderTopColor: "#374151",
  },
  helpfulPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  helpfulText: {
    fontSize: 11,
    color: "#6B7280",
  },
  paginationRow: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
  },
  paginationRowDark: {
    borderTopColor: "#374151",
  },
  paginationInfoWrap: {
    flex: 1,
    minWidth: 0,
  },
  paginationInfoText: {
    fontSize: 13,
    color: "#6B7280",
  },
  paginationBold: {
    fontWeight: "700",
    color: "#111827",
  },
  paginationControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pageNavBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  pageNavBtnDark: {
    backgroundColor: "#374151",
    borderColor: "#4B5563",
  },
  pageNavBtnHovered: {
    backgroundColor: "#E5E7EB",
  },
  pageNavBtnDisabled: {
    opacity: 0.35,
  },
  pageNavText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  pageNavTextDisabled: {
    color: "#9CA3AF",
  },
  pageNumbersWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  pageNumberBtn: {
    minWidth: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingHorizontal: 8,
  },
  pageNumberBtnDark: {
    backgroundColor: "#374151",
    borderColor: "#4B5563",
  },
  pageNumberBtnHovered: {
    backgroundColor: "#E5E7EB",
  },
  pageNumberBtnActive: {
    backgroundColor: "#E11D48",
    borderColor: "#E11D48",
    shadowColor: "#E11D48",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pageNumberBtnActiveDark: {
    backgroundColor: "#E11D48",
    borderColor: "#E11D48",
  },
  pageNumberText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  pageNumberTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  dotsWrap: {
    width: 20,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  dotsText: {
    fontSize: 14,
    color: "#9CA3AF",
    fontWeight: "700",
  },
  photoModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  closePhotoBtn: {
    position: "absolute",
    top: 40,
    right: 20,
    padding: 10,
    zIndex: 10,
  },
  modalFullImage: {
    width: "100%",
    height: "80%",
  },
  textDark: {
    color: "#F9FAFB",
  },
  textMutedDark: {
    color: "#9CA3AF",
  },
});
