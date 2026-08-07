import React, { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CheckCircle2, Pencil, ThumbsUp, Trash2 } from "lucide-react-native";
import type { Review } from "./types";
import { reviewImageSource, reviewPalette } from "./types";
import { fonts, typeScale, typeLeading } from "@/constants/typography";

export type ReviewCardProps = { review: Review; dark?: boolean; onHelpful?: (review: Review) => void; onEdit?: (review: Review) => void; onDelete?: (review: Review) => void; helpfulBusy?: boolean };
const formatDate = (value: string | Date) => new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));

export default function ReviewCard({ review, dark = false, onHelpful, onEdit, onDelete, helpfulBusy = false }: ReviewCardProps) {
  const c = reviewPalette(dark);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const initial = review.customerName.trim().charAt(0).toUpperCase() || "?";
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
    <View style={styles.authorRow}>
      {review.customerAvatar && !avatarFailed ? <Image source={reviewImageSource(review.customerAvatar)} onError={() => setAvatarFailed(true)} style={styles.avatar} /> : <View style={[styles.fallback, { backgroundColor: c.soft }]}><Text style={[styles.initial, { color: c.pink }]}>{initial}</Text></View>}
      <View style={styles.authorCopy}><Text numberOfLines={1} style={[styles.name, { color: c.text }]}>{review.customerName}</Text>
        {review.verifiedCustomer ? <View style={styles.verified}><CheckCircle2 size={12} color={c.pink} /><Text style={[styles.verifiedText, { color: c.pink }]}>Verified Customer</Text></View> : null}
      </View>
      <Text style={[styles.date, { color: c.muted }]}>{formatDate(review.createdAt)}</Text>
    </View>
    <Text accessibilityLabel={`${review.rating} out of 5 stars`} style={[styles.stars, { color: c.gold }]}>{"★".repeat(review.rating)}<Text style={{ color: dark ? "#51484C" : "#E9DFE3" }}>{"★".repeat(5 - review.rating)}</Text></Text>
    <Text style={[styles.body, { color: c.muted }]}>{review.text}</Text>
    {review.photos?.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>{review.photos.map((photo, i) => <Image key={i} source={reviewImageSource(photo)} style={[styles.photo, { backgroundColor: c.soft }]} />)}</ScrollView> : null}
    <View style={[styles.actions, { borderTopColor: c.border }]}>
      <Pressable disabled={!onHelpful || helpfulBusy} onPress={() => onHelpful?.(review)} style={styles.action}><ThumbsUp size={16} color={review.isHelpful ? c.pink : c.muted} fill={review.isHelpful ? c.pink : "transparent"} /><Text style={[styles.actionText, { color: review.isHelpful ? c.pink : c.muted }]}>Helpful ({review.helpfulCount})</Text></Pressable>
      {review.isOwner ? <View style={styles.ownerActions}>
        {onEdit ? <Pressable onPress={() => onEdit(review)} style={styles.action}><Pencil size={15} color={c.pink} /><Text style={[styles.actionText, { color: c.pink }]}>Edit</Text></Pressable> : null}
        {onDelete ? <Pressable onPress={() => onDelete(review)} style={styles.action}><Trash2 size={15} color="#D95555" /><Text style={[styles.actionText, { color: "#D95555" }]}>Delete</Text></Pressable> : null}
      </View> : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8, shadowColor: "#94546C", shadowOpacity: .045, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
  authorRow: { flexDirection: "row", alignItems: "center", gap: 10 }, avatar: { width: 42, height: 42, borderRadius: 21 }, fallback: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" }, initial: { fontFamily: fonts.serif.bold, fontSize: typeScale.editorialCardTitle },
  authorCopy: { flex: 1, minWidth: 0 }, name: { fontSize: typeScale.body, fontWeight: "700" }, verified: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }, verifiedText: { fontSize: typeScale.caption, fontWeight: "600" }, date: { fontSize: typeScale.caption },
  stars: { fontSize: typeScale.body, letterSpacing: 1 }, body: { fontSize: typeScale.body, lineHeight: typeLeading.cardTitle },
  photos: { gap: 8, paddingTop: 3 }, photo: { width: 108, height: 90, borderRadius: 12 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, marginTop: 5, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  action: { minHeight: 32, flexDirection: "row", alignItems: "center", gap: 6 }, actionText: { fontSize: typeScale.metadata, fontWeight: "600" }, ownerActions: { flexDirection: "row", gap: 14 },
});
