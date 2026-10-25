import React from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// NativeWind's native Pressable interop drops function `style={(state) =>
// [...]}` props on Android; InteropSafePressable resolves it first.
import Pressable from "@/components/InteropSafePressable";
import ReviewCard from "./ReviewCard";
import ReviewFilters from "./ReviewFilters";
import ReviewForm from "./ReviewForm";
import ReviewSummary from "./ReviewSummary";
import type { Review, ReviewDraft, ReviewSort, StarCounts, StarFilter } from "./types";
import { reviewPalette } from "./types";
import { typeStyles, typeScale } from "@/constants/typography";

export type VendorReviewsSectionProps = {
  average: number; total: number; counts: StarCounts; reviews: Review[];
  sort: ReviewSort; starFilter: StarFilter; dark?: boolean;
  loading?: boolean; loadingMore?: boolean; hasMore?: boolean; error?: string | null;
  showForm?: boolean; editingReview?: Review | null; submitting?: boolean; formError?: string | null; reviewPhotos?: string[];
  canWriteReview?: boolean;
  onAddPhotos?: () => void; onRemovePhoto?: (url: string) => void; uploadingPhotos?: boolean;
  onWriteReview?: () => void; onCloseForm?: () => void; onSubmitReview?: (draft: ReviewDraft) => void | Promise<void>;
  onSortChange: (sort: ReviewSort) => void; onStarFilterChange: (star: StarFilter) => void;
  onHelpful?: (review: Review) => void; onEdit?: (review: Review) => void; onDelete?: (review: Review) => void;
  onLoadMore?: () => void; onRetry?: () => void;
};

export default function VendorReviewsSection(props: VendorReviewsSectionProps) {
  const { dark = false } = props;
  const c = reviewPalette(dark);
  const insets = useSafeAreaInsets();
  return <View style={styles.section}>
    <View style={styles.headingRow}>
      <View style={styles.headingWrap}><Text style={[styles.heading, { color: c.text }]}>Reviews & Ratings</Text><View style={styles.ornament}><View style={[styles.line, { backgroundColor: c.ornament }]} /><View style={[styles.dot, { backgroundColor: c.ornament }]} /><View style={[styles.line, { backgroundColor: c.ornament }]} /></View></View>
      {props.onWriteReview ? <Pressable
        accessibilityRole="button"
        accessibilityLabel="Write a Review"
        accessibilityState={{ disabled: props.canWriteReview === false }}
        disabled={props.canWriteReview === false}
        onPress={props.onWriteReview}
        style={({ pressed, hovered }) => [
          styles.writeButton,
          { backgroundColor: c.pink, opacity: props.canWriteReview === false ? 0.5 : 1, shadowColor: c.shadow },
          hovered && Platform.OS === "web" && [styles.writeButtonHover, { backgroundColor: c.pinkHover }],
          pressed && styles.writeButtonPressed,
        ]}
      >
        <Text style={[styles.writeButtonText, { color: c.onPink }]}>Write a Review</Text>
      </Pressable> : null}
    </View>
    <ReviewSummary average={props.average} total={props.total} counts={props.counts} dark={dark} onSelectStar={props.onStarFilterChange} selectedStar={props.starFilter} />
    <Modal
      visible={Boolean(props.showForm && props.onSubmitReview)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={props.onCloseForm}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.reviewModalKeyboard}
      >
        <View style={[styles.reviewModalBackdrop, { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) }]}>
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.reviewModalScroll}
          >
            <View accessibilityViewIsModal style={styles.reviewModalContent}>
              {props.onSubmitReview ? <ReviewForm
                initialValue={props.editingReview ? { rating: props.editingReview.rating, title: props.editingReview.title, text: props.editingReview.text, photos: props.reviewPhotos ?? [] } : undefined}
                photos={props.reviewPhotos ?? []} dark={dark} submitting={props.submitting} error={props.formError}
                onSubmit={props.onSubmitReview} onCancel={props.onCloseForm}
                onAddPhotos={props.onAddPhotos} onRemovePhoto={props.onRemovePhoto} uploadingPhotos={props.uploadingPhotos}
              /> : null}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <ReviewFilters sort={props.sort} star={props.starFilter} dark={dark} onSortChange={props.onSortChange} onStarChange={props.onStarFilterChange} />
    {props.loading ? <View accessibilityRole="progressbar" accessibilityLabel="Loading reviews" style={styles.state}><ActivityIndicator color={c.pink} /><Text style={[styles.stateText, { color: c.muted }]}>Loading reviews…</Text></View>
      : props.error ? <View accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[styles.stateCard, { backgroundColor: c.soft, borderColor: c.border }]}><Text style={[styles.stateTitle, { color: c.text }]}>Reviews could not be loaded</Text><Text style={[styles.stateText, { color: c.muted }]}>{props.error}</Text>{props.onRetry ? <Pressable accessibilityRole="button" accessibilityLabel="Retry loading reviews" onPress={props.onRetry} style={[styles.smallButton, { borderColor: c.pink }]}><Text style={[styles.smallButtonText, { color: c.pink }]}>Try again</Text></Pressable> : null}</View>
      : props.reviews.length === 0 ? <View style={[styles.stateCard, { backgroundColor: c.soft, borderColor: c.border }]}><Text style={[styles.stateTitle, { color: c.text }]}>No reviews yet</Text><Text style={[styles.stateText, { color: c.muted }]}>Be the first customer to share an experience with this vendor.</Text></View>
      : <View style={styles.list}>{props.reviews.map(review => <ReviewCard key={review.id} review={review} dark={dark} onHelpful={props.onHelpful} onEdit={props.onEdit} onDelete={props.onDelete} />)}</View>}
    {props.hasMore && props.onLoadMore ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: props.loadingMore, busy: props.loadingMore }} disabled={props.loadingMore} onPress={props.onLoadMore} style={[styles.loadMore, { borderColor: c.border, backgroundColor: c.surface }]}>{props.loadingMore ? <ActivityIndicator color={c.pink} /> : <Text style={[styles.loadMoreText, { color: c.pink }]}>Load more reviews</Text>}</Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({
  section: { width: "100%", gap: 16, paddingTop: 5 },
  headingRow: { width: "100%", flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headingWrap: { alignItems: "flex-start" }, heading: { ...typeStyles.editorialSectionTitle },
  writeButton: { minHeight: 48, borderRadius: 22, paddingHorizontal: 17, alignItems: "center", justifyContent: "center", shadowOpacity: 0.12, shadowRadius: 7, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  writeButtonText: { fontSize: typeScale.bodyCompact, fontWeight: "700" },
  writeButtonHover: { transform: [{ translateY: -1 }] },
  writeButtonPressed: { transform: [{ scale: 0.98 }], opacity: 0.86 },
  ornament: { width: 88, height: 8, flexDirection: "row", alignItems: "center", gap: 4 }, line: { flex: 1, height: StyleSheet.hairlineWidth }, dot: { width: 4, height: 4, borderRadius: 2 },
  list: { gap: 12 }, state: { minHeight: 130, alignItems: "center", justifyContent: "center", gap: 10 }, stateCard: { minHeight: 130, borderWidth: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", padding: 22, gap: 7 },
  stateTitle: { ...typeStyles.editorialCardTitle, textAlign: "center" }, stateText: { ...typeStyles.body, textAlign: "center" },
  smallButton: { marginTop: 5, minHeight: 48, paddingHorizontal: 16, borderWidth: 1, borderRadius: 20, justifyContent: "center" }, smallButtonText: { fontSize: typeScale.bodyCompact, fontWeight: "700" },
  loadMore: { alignSelf: "center", minWidth: 180, minHeight: 48, borderWidth: 1, borderRadius: 23, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 }, loadMoreText: { fontSize: typeScale.body, fontWeight: "700" },
  reviewModalKeyboard: { flex: 1 },
  reviewModalBackdrop: { flex: 1, justifyContent: "center", backgroundColor: "rgba(20, 10, 15, 0.64)", paddingHorizontal: 16 },
  reviewModalScroll: { flexGrow: 1, justifyContent: "center" },
  reviewModalContent: { width: "100%", maxWidth: 520, alignSelf: "center" },
});
