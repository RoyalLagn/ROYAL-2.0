import React, { useEffect, useMemo } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { BadgeCheck, MapPin, MessageCircle, Star } from "lucide-react-native";
import type { ClipEngagementState, PublicClip } from "../types";
import { PublicClipActions } from "./PublicClipActions";
import { PublicClipVideo } from "./PublicClipVideo";

type PublicClipCardProps = {
  clip: PublicClip;
  height: number;
  active: boolean;
  nearby: boolean;
  muted: boolean;
  engagement: ClipEngagementState;
  counts: { likes: number; saves: number; views: number };
  onToggleMuted: () => void;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
  onVendor: () => void;
  onContact: () => void;
};

function PublicClipCardComponent({
  clip, height, active, nearby, muted, engagement, counts,
  onToggleMuted, onLike, onSave, onShare, onVendor, onContact,
}: PublicClipCardProps) {
  const contentOpacity = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    contentOpacity.value = withTiming(active ? 1 : 0.45, { duration: 220 });
  }, [active, contentOpacity]);
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
  const caption = useMemo(() => {
    const value = clip.caption?.trim() ?? "";
    return value.length > 128 ? `${value.slice(0, 125).trimEnd()}… more` : value;
  }, [clip.caption]);

  return <View style={[styles.card, { height }]}>
    {nearby
      ? <PublicClipVideo
        uri={clip.videoUrl}
        thumbnailUrl={clip.thumbnailUrl}
        active={active}
        muted={muted}
        onToggleMuted={onToggleMuted}
        onDoubleTapLike={() => {
          if (!engagement.liked) onLike();
        }}
      />
      : <Image source={{ uri: clip.thumbnailUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />}
    <LinearGradient
      pointerEvents="none"
      colors={["rgba(4,3,4,.06)", "rgba(4,3,4,.02)", "rgba(4,3,4,.24)", "rgba(4,3,4,.94)"]}
      locations={[0, 0.42, 0.68, 1]}
      style={StyleSheet.absoluteFill}
    />
    <PublicClipActions
      avatarUrl={clip.vendor.avatarUrl}
      vendorName={clip.vendor.name}
      liked={engagement.liked}
      saved={engagement.saved}
      likes={counts.likes}
      onVendor={onVendor}
      onLike={onLike}
      onSave={onSave}
      onShare={onShare}
    />
    <Animated.View style={[styles.info, contentStyle]}>
      <Text numberOfLines={1} style={styles.title}>{clip.title}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${clip.vendor.name} profile`} onPress={onVendor} style={styles.vendorRow}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={styles.vendorName}>{clip.vendor.name}</Text>
          {clip.vendor.verified && <BadgeCheck size={15} color="#FFF" fill="#E91E63" />}
        </View>
        <View style={styles.metaRow}>
          {clip.vendor.city ? <><MapPin size={11} color="#F8EDF2" /><Text style={styles.meta}>{clip.vendor.city}</Text><Text style={styles.dot}>•</Text></> : null}
          <Text style={styles.category}>{clip.categoryName}</Text>
          {clip.vendor.rating > 0 && <><Text style={styles.dot}>•</Text><Star size={11} color="#FFD166" fill="#FFD166" /><Text style={styles.meta}>{clip.vendor.rating.toFixed(1)}</Text></>}
        </View>
      </Pressable>
      {caption ? <Text numberOfLines={2} style={styles.caption}>{caption}</Text> : null}
      {clip.hashtags.length > 0 && <Text numberOfLines={1} style={styles.hashtags}>{clip.hashtags.join("  ")}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={`Contact ${clip.vendor.name}`} onPress={onContact} style={styles.contact}>
        <MessageCircle size={14} color="#FFF" /><Text style={styles.contactText}>Contact vendor</Text>
      </Pressable>
    </Animated.View>
  </View>;
}

export const PublicClipCard = React.memo(
  PublicClipCardComponent,
  (previous, next) =>
    previous.clip === next.clip
    && previous.height === next.height
    && previous.active === next.active
    && previous.nearby === next.nearby
    && previous.muted === next.muted
    && previous.engagement.liked === next.engagement.liked
    && previous.engagement.saved === next.engagement.saved
    && previous.counts.likes === next.counts.likes
    && previous.counts.saves === next.counts.saves
    && previous.counts.views === next.counts.views,
);

const styles = StyleSheet.create({
  card: { width: "100%", backgroundColor: "#080608", overflow: "hidden" },
  info: { position: "absolute", left: 16, right: 104, bottom: 24, zIndex: 3 },
  title: { color: "#FFF", fontSize: 22, lineHeight: 27, fontWeight: "900", letterSpacing: -0.4, marginBottom: 8, textShadowColor: "rgba(0,0,0,.7)", textShadowRadius: 8 },
  vendorRow: { alignSelf: "flex-start", marginBottom: 8 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  vendorName: { maxWidth: 240, color: "#FFF", fontSize: 13, fontWeight: "900" },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 4 },
  meta: { color: "#F8EDF2", fontSize: 10, fontWeight: "700" },
  category: { color: "#FFB0CD", fontSize: 10, fontWeight: "800" },
  dot: { color: "rgba(255,255,255,.62)", fontSize: 9 },
  caption: { color: "#FFF", fontSize: 12, lineHeight: 17, fontWeight: "500", textShadowColor: "rgba(0,0,0,.7)", textShadowRadius: 5 },
  hashtags: { color: "#FFB0CD", fontSize: 11, lineHeight: 16, fontWeight: "800", marginTop: 5 },
  contact: { alignSelf: "flex-start", height: 34, borderRadius: 17, marginTop: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(10,7,9,.48)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,.3)" },
  contactText: { color: "#FFF", fontSize: 9, fontWeight: "900" },
});
