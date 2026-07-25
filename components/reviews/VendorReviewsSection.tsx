import React from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import ReviewCard from "./ReviewCard";
import ReviewFilters from "./ReviewFilters";
import ReviewForm from "./ReviewForm";
import ReviewSummary from "./ReviewSummary";
import type { Review, ReviewDraft, ReviewSort, StarCounts, StarFilter } from "./types";
import { reviewPalette } from "./types";

export type VendorReviewsSectionProps = {
  average: number; total: number; counts: StarCounts; reviews: Review[];
  sort: ReviewSort; starFilter: StarFilter; dark?: boolean;
  loading?: boolean; loadingMore?: boolean; hasMore?: boolean; error?: string | null;
  showForm?: boolean; editingReview?: Review | null; submitting?: boolean; formError?: string | null; reviewPhotos?: string[];
  canWriteReview?: boolean;
  onWriteReview?: () => void; onCloseForm?: () => void; onSubmitReview?: (draft: ReviewDraft) => void | Promise<void>;
  onAddPhotos?: () => void; onRemovePhoto?: (uri: string, index: number) => void;
  onSortChange: (sort: ReviewSort) => void; onStarFilterChange: (star: StarFilter) => void;
  onHelpful?: (review: Review) => void; onEdit?: (review: Review) => void; onDelete?: (review: Review) => void;
  onLoadMore?: () => void; onRetry?: () => void;
};

export default function VendorReviewsSection(props: VendorReviewsSectionProps) {
  const { dark = false } = props;
  const c = reviewPalette(dark);
  return <View style={styles.section}>
    <View style={styles.headingRow}>
      <View style={styles.headingWrap}><Text style={[styles.heading, { color: c.text }]}>Reviews & Ratings</Text><View style={styles.ornament}><View style={styles.line} /><View style={styles.dot} /><View style={styles.line} /></View></View>
      {props.onWriteReview ? <Pressable
        accessibilityRole="button"
        accessibilityLabel="Write a Review"
        disabled={props.canWriteReview === false}
        onPress={props.onWriteReview}
        style={({ pressed, hovered }) => [
          styles.writeButton,
          { backgroundColor: c.pink, opacity: props.canWriteReview === false ? 0.5 : 1 },
          hovered && Platform.OS === "web" && styles.writeButtonHover,
          pressed && styles.writeButtonPressed,
        ]}
      >
        <Text style={styles.writeButtonText}>Write a Review</Text>
      </Pressable> : null}
    </View>
    <ReviewSummary average={props.average} total={props.total} counts={props.counts} dark={dark} />
    {props.showForm && props.onSubmitReview ? <ReviewForm
      initialValue={props.editingReview ? { rating: props.editingReview.rating, title: props.editingReview.title, text: props.editingReview.text, photos: props.reviewPhotos ?? [] } : undefined}
      photos={props.reviewPhotos ?? []} dark={dark} submitting={props.submitting} error={props.formError}
      onSubmit={props.onSubmitReview} onCancel={props.onCloseForm}
      onAddPhotos={props.onAddPhotos ?? (() => undefined)} onRemovePhoto={props.onRemovePhoto ?? (() => undefined)}
    /> : null}
    <ReviewFilters sort={props.sort} star={props.starFilter} dark={dark} onSortChange={props.onSortChange} onStarChange={props.onStarFilterChange} />
    {props.loading ? <View style={styles.state}><ActivityIndicator color={c.pink} /><Text style={[styles.stateText, { color: c.muted }]}>Loading reviews…</Text></View>
      : props.error ? <View style={[styles.stateCard, { backgroundColor: c.soft, borderColor: c.border }]}><Text style={[styles.stateTitle, { color: c.text }]}>Reviews could not be loaded</Text><Text style={[styles.stateText, { color: c.muted }]}>{props.error}</Text>{props.onRetry ? <Pressable onPress={props.onRetry} style={[styles.smallButton, { borderColor: c.pink }]}><Text style={[styles.smallButtonText, { color: c.pink }]}>Try again</Text></Pressable> : null}</View>
      : props.reviews.length === 0 ? <View style={[styles.stateCard, { backgroundColor: c.soft, borderColor: c.border }]}><Text style={[styles.stateTitle, { color: c.text }]}>No reviews yet</Text><Text style={[styles.stateText, { color: c.muted }]}>Be the first customer to share an experience with this vendor.</Text></View>
      : <View style={styles.list}>{props.reviews.map(review => <ReviewCard key={review.id} review={review} dark={dark} onHelpful={props.onHelpful} onEdit={props.onEdit} onDelete={props.onDelete} />)}</View>}
    {props.hasMore && props.onLoadMore ? <Pressable disabled={props.loadingMore} onPress={props.onLoadMore} style={[styles.loadMore, { borderColor: c.border, backgroundColor: c.surface }]}>{props.loadingMore ? <ActivityIndicator color={c.pink} /> : <Text style={[styles.loadMoreText, { color: c.pink }]}>Load more reviews</Text>}</Pressable> : null}
  </View>;
}
const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });
const styles = StyleSheet.create({
  section: { width: "100%", gap: 16, paddingTop: 5 },
  headingRow: { width: "100%", flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headingWrap: { alignItems: "flex-start" }, heading: { fontFamily: serif, fontSize: 25, lineHeight: 32, fontWeight: "600" },
  writeButton: { minHeight: 44, borderRadius: 23, paddingHorizontal: 19, alignItems: "center", justifyContent: "center", shadowColor: "#A32E59", shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  writeButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  writeButtonHover: { transform: [{ translateY: -1 }], backgroundColor: "#CF2E65" },
  writeButtonPressed: { transform: [{ scale: 0.98 }], opacity: 0.86 },
  ornament: { width: 88, height: 8, flexDirection: "row", alignItems: "center", gap: 4 }, line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: "#D8A55B" }, dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: "#D8A55B" },
  list: { gap: 12 }, state: { minHeight: 130, alignItems: "center", justifyContent: "center", gap: 10 }, stateCard: { minHeight: 130, borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", padding: 22, gap: 7 },
  stateTitle: { fontFamily: serif, fontSize: 18, fontWeight: "600", textAlign: "center" }, stateText: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  smallButton: { marginTop: 5, minHeight: 38, paddingHorizontal: 16, borderWidth: 1, borderRadius: 20, justifyContent: "center" }, smallButtonText: { fontSize: 12, fontWeight: "700" },
  loadMore: { alignSelf: "center", minWidth: 180, minHeight: 44, borderWidth: 1, borderRadius: 23, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 }, loadMoreText: { fontSize: 13, fontWeight: "700" },
});
