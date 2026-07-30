import React, { useEffect, useMemo, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { BadgeCheck, MapPin, MessageCircle, Star } from "lucide-react-native";
import type { ClipEngagementState, PublicClip } from "../types";
import { PublicClipActions } from "./PublicClipActions";
import { PublicClipVideo } from "./PublicClipVideo";

type PublicClipCardProps = {
  clip: PublicClip;
  width: number;
  height: number;
  compact: boolean;
  desktop: boolean;
  dark: boolean;
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
  clip, width, height, compact, desktop, dark, active, nearby, muted, engagement, counts,
  onToggleMuted, onLike, onSave, onShare, onVendor, onContact,
}: PublicClipCardProps) {
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const contentOpacity = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    contentOpacity.value = withTiming(active ? 1 : 0.45, { duration: 220 });
  }, [active, contentOpacity]);
  const contentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
  const caption = useMemo(() => clip.caption?.trim() ?? "", [clip.caption]);
  const longCaption = caption.length > 112;
  const foreground = desktop && !dark ? "#171717" : "#FFFFFF";
  const mutedColor = desktop && !dark ? "#737373" : "#E6DCE1";
  const displayedCaption = captionExpanded || !longCaption
    ? caption
    : `${caption.slice(0, 109).trimEnd()}…`;

  const vendorProfile = (
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${clip.vendor.name} profile`} onPress={onVendor} style={styles.vendorRow}>
      <View style={[styles.profileAvatar, { backgroundColor: dark ? "#26141D" : "#FCEAF1" }]}>
        {clip.vendor.avatarUrl
          ? <Image source={{ uri: clip.vendor.avatarUrl }} style={styles.profileAvatarImage} />
          : <Text style={styles.profileAvatarLetter}>{clip.vendor.name.slice(0, 1).toUpperCase()}</Text>}
      </View>
      <View style={styles.profileCopy}>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} style={[styles.vendorName, { color: foreground }]}>{clip.vendor.name}</Text>
          {clip.vendor.verified && <BadgeCheck size={14} color="#FFF" fill="#E91E63" />}
        </View>
        <View style={styles.metaRow}>
          {clip.vendor.city ? <><MapPin size={10} color={mutedColor} /><Text style={[styles.meta, { color: mutedColor }]}>{clip.vendor.city}</Text><Text style={[styles.dot, { color: mutedColor }]}>•</Text></> : null}
          <Text style={styles.category}>{clip.categoryName}</Text>
          {clip.vendor.rating > 0 && <><Text style={[styles.dot, { color: mutedColor }]}>•</Text><Star size={10} color="#EBA01A" fill="#EBA01A" /><Text style={[styles.meta, { color: mutedColor }]}>{clip.vendor.rating.toFixed(1)}</Text></>}
        </View>
      </View>
    </Pressable>
  );

  const description = caption ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={captionExpanded ? "Show less description" : "Read full description"}
      disabled={!longCaption}
      onPress={() => setCaptionExpanded((value) => !value)}
      style={styles.captionButton}
    >
      <Text numberOfLines={captionExpanded ? undefined : 3} style={[styles.caption, !desktop && styles.captionOverlay, compact && styles.captionCompact, { color: foreground }]}>
        {desktop ? <Text style={[styles.captionVendor, { color: foreground }]}>{clip.vendor.name} </Text> : null}
        {displayedCaption}
        {longCaption ? <Text style={[styles.more, { color: mutedColor }]}>{captionExpanded ? "  less" : "  more"}</Text> : null}
      </Text>
    </Pressable>
  ) : null;

  const contactButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Contact ${clip.vendor.name}`}
      onPress={onContact}
      style={[styles.contact, compact && styles.contactCompact, desktop && styles.contactDesktop, desktop && { borderColor: dark ? "#3A3A3A" : "#DBDBDB" }]}
    >
      <MessageCircle size={14} color={desktop ? "#E91E63" : "#FFF"} />
      <Text style={[styles.contactText, desktop && { color: "#E91E63" }]}>Contact vendor</Text>
    </Pressable>
  );

  const video = (
    <View style={[styles.card, compact && styles.cardCompact, { width, height }, Platform.OS === "web" ? styles.cardWeb : null]}>
      {nearby
        ? <PublicClipVideo
          uri={clip.videoUrl}
          thumbnailUrl={clip.thumbnailUrl}
          sourceWidth={clip.resolution.width}
          sourceHeight={clip.resolution.height}
          active={active}
          muted={muted}
          onToggleMuted={onToggleMuted}
          onDoubleTapLike={() => {
            if (!engagement.liked) onLike();
          }}
        />
        : <Image source={{ uri: clip.thumbnailUrl }} resizeMode="cover" style={StyleSheet.absoluteFill} />}
      {!desktop ? <LinearGradient
        pointerEvents="none"
        colors={["rgba(4,3,4,.04)", "rgba(4,3,4,.02)", "rgba(4,3,4,.24)", "rgba(4,3,4,.94)"]}
        locations={[0, 0.42, 0.68, 1]}
        style={StyleSheet.absoluteFill}
      /> : null}
      {!desktop ? <>
        <PublicClipActions
          avatarUrl={clip.vendor.avatarUrl}
          vendorName={clip.vendor.name}
          liked={engagement.liked}
          saved={engagement.saved}
          likes={counts.likes}
          compact={compact}
          showAvatar={false}
          onVendor={onVendor}
          onLike={onLike}
          onSave={onSave}
          onShare={onShare}
        />
        <Animated.View style={[styles.info, compact && styles.infoCompact, contentStyle]}>
          {vendorProfile}
          {description}
          {clip.hashtags.length > 0 && <Text numberOfLines={1} style={styles.hashtags}>{clip.hashtags.join("  ")}</Text>}
          {contactButton}
        </Animated.View>
      </> : null}
    </View>
  );

  if (!desktop) return video;

  return <View style={[styles.desktopShell, { width: width + 508, height }]}>
    <View style={styles.desktopSide}>
      <View style={styles.desktopInfoContent}>
        {vendorProfile}
        {description}
        {clip.hashtags.length > 0 && <Text numberOfLines={2} style={styles.hashtags}>{clip.hashtags.join("  ")}</Text>}
        {contactButton}
      </View>
    </View>
    {video}
    <View style={styles.desktopActionSide}>
      <PublicClipActions
        avatarUrl={clip.vendor.avatarUrl}
        vendorName={clip.vendor.name}
        liked={engagement.liked}
        saved={engagement.saved}
        likes={counts.likes}
        outside
        rail
        dark={dark}
        showAvatar={false}
        onVendor={onVendor}
        onLike={onLike}
        onSave={onSave}
        onShare={onShare}
      />
    </View>
  </View>;
}

export const PublicClipCard = React.memo(
  PublicClipCardComponent,
  (previous, next) =>
    previous.clip === next.clip
    && previous.width === next.width
    && previous.height === next.height
    && previous.compact === next.compact
    && previous.desktop === next.desktop
    && previous.dark === next.dark
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
  desktopShell: { flexShrink: 0, alignSelf: "center", flexDirection: "row", alignItems: "stretch", justifyContent: "center", gap: 14 },
  desktopSide: { width: 240, height: "100%", justifyContent: "flex-end", paddingBottom: 20 },
  desktopActionSide: { width: 240, height: "100%", alignItems: "flex-start", justifyContent: "flex-end", paddingBottom: 20 },
  desktopInfoContent: { width: "100%", paddingHorizontal: 8 },
  card: { flexShrink: 0, borderRadius: 20, backgroundColor: "#080608", overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,.16)" },
  cardCompact: { borderRadius: 16 },
  cardWeb: { boxShadow: "0 18px 50px rgba(0,0,0,.34)" } as any,
  info: { position: "absolute", left: 15, right: 76, bottom: 18, zIndex: 3 },
  infoCompact: { left: 13, right: 70, bottom: 14 },
  vendorRow: { width: "100%", flexDirection: "row", alignItems: "center", marginBottom: 9 },
  profileAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(233,30,99,.42)", overflow: "hidden" },
  profileAvatarImage: { width: "100%", height: "100%" },
  profileAvatarLetter: { color: "#E91E63", fontSize: 14, fontWeight: "900" },
  profileCopy: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  vendorName: { maxWidth: 230, color: "#FFF", fontSize: 12, fontWeight: "900" },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 4 },
  meta: { color: "#F8EDF2", fontSize: 10, fontWeight: "700" },
  category: { color: "#FFB0CD", fontSize: 10, fontWeight: "800" },
  dot: { color: "rgba(255,255,255,.62)", fontSize: 9 },
  captionButton: { maxWidth: "100%", alignSelf: "flex-start" },
  caption: { color: "#FFF", fontSize: 11, lineHeight: 16, fontWeight: "500" },
  captionOverlay: { textShadowColor: "rgba(0,0,0,.78)", textShadowRadius: 5 },
  captionCompact: { fontSize: 10, lineHeight: 14 },
  captionVendor: { fontWeight: "900" },
  more: { color: "#FFD2E2", fontWeight: "900" },
  hashtags: { color: "#FFB0CD", fontSize: 10, lineHeight: 14, fontWeight: "800", marginTop: 4 },
  contact: { alignSelf: "flex-start", height: 34, borderRadius: 17, marginTop: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(10,7,9,.48)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,.3)" },
  contactCompact: { height: 32, borderRadius: 16, marginTop: 8, paddingHorizontal: 11 },
  contactDesktop: { backgroundColor: "transparent", minWidth: 136, justifyContent: "center", marginTop: 16 },
  contactText: { color: "#FFF", fontSize: 9, fontWeight: "900" },
});
