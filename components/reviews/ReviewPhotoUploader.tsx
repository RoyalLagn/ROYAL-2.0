import React from "react";
import { Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Camera, X } from "lucide-react-native";
import { reviewPalette } from "./types";
import { typeScale } from "@/constants/typography";

export type ReviewPhotoUploaderProps = { photos: string[]; dark?: boolean; disabled?: boolean; maxPhotos?: number; onAdd: () => void; onRemove: (uri: string, index: number) => void };
export default function ReviewPhotoUploader({ photos, dark = false, disabled = false, maxPhotos = 6, onAdd, onRemove }: ReviewPhotoUploaderProps) {
  const c = reviewPalette(dark);
  return <View style={styles.wrap}>
    <Text style={[styles.label, { color: c.text }]}>Photos <Text style={{ color: c.muted }}>(optional)</Text></Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {photos.map((uri, index) => <View key={`${uri}-${index}`} style={[styles.photoWrap, { borderColor: c.border }]}>
        <Image source={{ uri }} style={styles.photo} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove photo ${index + 1}`} onPress={() => onRemove(uri, index)} style={styles.remove}><X color="#FFF" size={13} /></Pressable>
      </View>)}
      {photos.length < maxPhotos ? <Pressable accessibilityRole="button" disabled={disabled} accessibilityLabel="Add review photos" onPress={onAdd} style={({ pressed, hovered }) => [styles.add, { backgroundColor: c.soft, borderColor: c.border }, pressed && styles.pressed, hovered && Platform.OS === "web" && styles.hovered]}>
        <Camera color={c.pink} size={21} /><Text style={[styles.addText, { color: c.pink }]}>Add photo</Text>
      </Pressable> : null}
    </ScrollView>
    <Text style={[styles.hint, { color: c.muted }]}>Up to {maxPhotos} images</Text>
  </View>;
}
const styles = StyleSheet.create({
  wrap: { gap: 8 }, label: { fontSize: typeScale.body, fontWeight: "600" }, row: { gap: 9 },
  photoWrap: { width: 78, height: 78, borderRadius: 13, borderWidth: 1, overflow: "hidden" }, photo: { width: "100%", height: "100%" },
  remove: { position: "absolute", top: 4, right: 4, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(24,15,19,.72)", alignItems: "center", justifyContent: "center" },
  add: { width: 92, height: 78, borderRadius: 13, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 5 },
  addText: { fontSize: typeScale.metadata, fontWeight: "600" }, hint: { fontSize: typeScale.metadata }, pressed: { opacity: .8 }, hovered: { transform: [{ translateY: -1 }] },
});
