import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, View } from "react-native";
import type { ReviewDraft } from "./types";
import { reviewPalette } from "./types";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
// NativeWind's native Pressable interop drops function `style={(state) =>
// [...]}` props on Android; InteropSafePressable resolves it first.
import Pressable from "@/components/InteropSafePressable";

export type ReviewFormProps = { initialValue?: Partial<ReviewDraft>; dark?: boolean; submitting?: boolean; error?: string | null; onSubmit: (draft: ReviewDraft) => void | Promise<void>; onCancel?: () => void; photos: string[]; submitLabel?: string; onAddPhotos?: () => void; onRemovePhoto?: (url: string) => void; uploadingPhotos?: boolean };
export default function ReviewForm({ initialValue, dark = false, submitting = false, error, onSubmit, onCancel, photos, submitLabel, onAddPhotos, onRemovePhoto, uploadingPhotos }: ReviewFormProps) {
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
    <View accessibilityRole="radiogroup" accessibilityLabel="Review rating" style={styles.stars}>{([1,2,3,4,5] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: rating === value, disabled: submitting }} accessibilityLabel={`${value} stars`} disabled={submitting} onPress={() => setRating(value)} hitSlop={7}><Text style={[styles.star, { color: value <= rating ? c.gold : c.inactiveStar }]}>★</Text></Pressable>)}</View>
    <TextInput accessibilityLabel="Review comment" accessibilityHint="Describe your experience with this vendor" accessibilityState={{ disabled: submitting }} value={text} onChangeText={setText} editable={!submitting} maxLength={2000} multiline placeholder="Write a comment…" placeholderTextColor={c.muted} style={[input, styles.textarea]} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {photos.map((url, index) => <View key={url}>
        <Image source={{ uri: url }} style={{ width: 72, height: 72, borderRadius: 10 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove review photo ${index + 1}`} disabled={submitting || uploadingPhotos} onPress={() => onRemovePhoto?.(url)}><Text style={{ color: c.destructive }}>Remove</Text></Pressable>
      </View>)}
    </View>
    {onAddPhotos && photos.length < 6 ? <Pressable accessibilityRole="button" accessibilityLabel="Add review photos" disabled={submitting || uploadingPhotos} onPress={onAddPhotos} style={[styles.cancel, { borderColor: c.border }]}>{uploadingPhotos ? <ActivityIndicator color={c.pink} /> : <Text style={{ color: c.pink }}>Add photos ({photos.length}/6)</Text>}</Pressable> : null}
    {error ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[styles.error, { color: c.destructive }]}>{error}</Text> : null}
    <View style={styles.buttons}>{onCancel ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: submitting }} disabled={submitting} onPress={onCancel} style={[styles.cancel, { borderColor: c.border }]}><Text style={[styles.cancelText, { color: c.muted }]}>Cancel</Text></Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: !valid || submitting || uploadingPhotos, busy: submitting }} accessibilityLabel={submitLabel ?? (initialValue ? "Update review" : "Submit review")} disabled={!valid || submitting || uploadingPhotos} onPress={() => {
        const comment = text.trim();
        onSubmit({ rating, title: initialValue?.title?.trim() || comment.slice(0, 100), text: comment, photos });
      }} style={({ pressed }) => [styles.submit, { backgroundColor: c.pink, opacity: valid && !submitting ? 1 : .45 }, pressed && styles.pressed]}>{submitting ? <ActivityIndicator color={c.onPink} /> : <Text style={[styles.submitText, { color: c.onPink }]}>{submitLabel ?? (initialValue ? "Update Review" : "Submit Review")}</Text>}</Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 17, gap: 12 }, heading: { ...typeStyles.editorialSectionTitle }, label: { ...typeStyles.label }, stars: { flexDirection: "row", gap: 8 }, star: { fontSize: typeScale.editorialPageTitle, lineHeight: typeLeading.editorialPageTitle },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: typeScale.body }, textarea: { minHeight: 116, paddingTop: 13, textAlignVertical: "top" },
  error: { fontSize: typeScale.bodyCompact }, buttons: { flexDirection: "row", justifyContent: "flex-end", gap: 10 }, cancel: { minHeight: 48, borderWidth: 1, borderRadius: 23, paddingHorizontal: 18, justifyContent: "center" }, cancelText: { fontWeight: "600" },
  submit: { minWidth: 140, minHeight: 48, borderRadius: 23, paddingHorizontal: 19, alignItems: "center", justifyContent: "center" }, submitText: { fontSize: typeScale.body, fontWeight: "700" }, pressed: { transform: [{ scale: .98 }], opacity: .86 },
});
