import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import ReviewPhotoUploader from "./ReviewPhotoUploader";
import type { ReviewDraft } from "./types";
import { reviewPalette } from "./types";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";

export type ReviewFormProps = { initialValue?: Partial<ReviewDraft>; dark?: boolean; submitting?: boolean; error?: string | null; onSubmit: (draft: ReviewDraft) => void | Promise<void>; onCancel?: () => void; onAddPhotos: () => void; onRemovePhoto: (uri: string, index: number) => void; photos: string[]; submitLabel?: string };
export default function ReviewForm({ initialValue, dark = false, submitting = false, error, onSubmit, onCancel, onAddPhotos, onRemovePhoto, photos, submitLabel }: ReviewFormProps) {
  const c = reviewPalette(dark);
  const [rating, setRating] = useState(initialValue?.rating ?? 0);
  const [text, setText] = useState(initialValue?.text ?? "");
  useEffect(() => {
    setRating(initialValue?.rating ?? 0);
    setText(initialValue?.text ?? "");
  }, [initialValue?.rating, initialValue?.text]);
  const valid = rating >= 1 && rating <= 5 && text.trim().length > 0;
  const input = [styles.input, { color: c.text, backgroundColor: c.soft, borderColor: c.border }];
  return <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
    <Text style={[styles.heading, { color: c.text }]}>{initialValue ? "Edit your review" : "Share your experience"}</Text>
    <Text style={[styles.label, { color: c.text }]}>Your rating</Text>
    <View accessibilityRole="radiogroup" style={styles.stars}>{([1,2,3,4,5] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: rating === value }} accessibilityLabel={`${value} stars`} onPress={() => setRating(value)} hitSlop={7}><Text style={[styles.star, { color: value <= rating ? c.gold : dark ? "#51484C" : "#E3D8DC" }]}>★</Text></Pressable>)}</View>
    <TextInput value={text} onChangeText={setText} editable={!submitting} maxLength={2000} multiline placeholder="Write a comment…" placeholderTextColor={c.muted} style={[input, styles.textarea]} />
    <ReviewPhotoUploader photos={photos} dark={dark} disabled={submitting} onAdd={onAddPhotos} onRemove={onRemovePhoto} />
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <View style={styles.buttons}>{onCancel ? <Pressable disabled={submitting} onPress={onCancel} style={[styles.cancel, { borderColor: c.border }]}><Text style={[styles.cancelText, { color: c.muted }]}>Cancel</Text></Pressable> : null}
      <Pressable disabled={!valid || submitting} onPress={() => {
        const comment = text.trim();
        onSubmit({ rating, title: initialValue?.title?.trim() || comment.slice(0, 100), text: comment, photos });
      }} style={({ pressed }) => [styles.submit, { backgroundColor: c.pink, opacity: valid && !submitting ? 1 : .45 }, pressed && styles.pressed]}>{submitting ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitText}>{submitLabel ?? (initialValue ? "Update Review" : "Submit Review")}</Text>}</Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 17, gap: 12 }, heading: { ...typeStyles.editorialSectionTitle }, label: { ...typeStyles.label }, stars: { flexDirection: "row", gap: 8 }, star: { fontSize: typeScale.editorialPageTitle, lineHeight: typeLeading.editorialPageTitle },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: typeScale.body }, textarea: { minHeight: 116, paddingTop: 13, textAlignVertical: "top" },
  error: { color: "#D94B55", fontSize: typeScale.bodyCompact }, buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 10 }, cancel: { minHeight: 44, borderWidth: 1, borderRadius: 23, paddingHorizontal: 18, justifyContent: "center" }, cancelText: { fontWeight: "600" },
  submit: { minWidth: 140, minHeight: 44, borderRadius: 23, paddingHorizontal: 19, alignItems: "center", justifyContent: "center" }, submitText: { color: "#FFF", fontSize: typeScale.body, fontWeight: "700" }, pressed: { transform: [{ scale: .98 }], opacity: .86 },
});
