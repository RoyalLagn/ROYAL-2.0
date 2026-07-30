import React, { useCallback } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle, useReducedMotion, useSharedValue, withSequence,
  withSpring, withTiming,
} from "react-native-reanimated";
import { Bookmark, Heart, Send } from "lucide-react-native";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function compactCount(count: number) {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}K`;
}

const Action = React.memo(function Action({
  label, count, active, compact, outside, dark, children, onPress, animation = "spring",
}: {
  label: string;
  count?: number;
  active?: boolean;
  compact?: boolean;
  outside?: boolean;
  dark?: boolean;
  children: React.ReactNode;
  onPress: () => void;
  animation?: "spring" | "ripple";
}) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);
  const reduced = useReducedMotion();
  const animate = useCallback(() => {
    if (reduced) return;
    scale.value = withSequence(withTiming(0.86, { duration: 70 }), withSpring(1, { damping: 9 }));
    if (animation === "ripple") glow.value = withSequence(withTiming(1, { duration: 100 }), withTiming(0, { duration: 420 }));
  }, [animation, glow, reduced, scale]);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 1 + glow.value * 0.55 }] }));
  return <View style={[styles.actionWrap, compact && styles.actionWrapCompact, outside && styles.actionWrapOutside]}>
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => { animate(); onPress(); }}
      style={[styles.action, compact && styles.actionCompact, outside && styles.actionOutside, animatedStyle]}
    >
      <Animated.View pointerEvents="none" style={[styles.ripple, compact && styles.rippleCompact, glowStyle]} />
      <View style={[
        styles.circle,
        compact && styles.circleCompact,
        outside && styles.circleOutside,
        outside && { backgroundColor: dark ? "#1B1719" : "#FFFFFF", borderColor: dark ? "#3B3035" : "#E9DDE2" },
        active && styles.activeCircle,
      ]}>
        {children}
      </View>
    </AnimatedPressable>
    {typeof count === "number" ? <Text style={[
      styles.count,
      outside && { color: dark ? "#F8F2F4" : "#2C2025", textShadowColor: "transparent", textShadowRadius: 0 },
    ]}>{compactCount(count)}</Text> : null}
  </View>;
});

export const PublicClipActions = React.memo(function PublicClipActions({
  avatarUrl, vendorName, liked, saved, likes, compact, outside, rail, dark, showAvatar = true,
  onVendor, onLike, onSave, onShare,
}: {
  avatarUrl: string | null;
  vendorName: string;
  liked: boolean;
  saved: boolean;
  likes: number;
  compact?: boolean;
  outside?: boolean;
  rail?: boolean;
  dark?: boolean;
  showAvatar?: boolean;
  onVendor: () => void;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
}) {
  const iconColor = outside && !dark ? "#1A1A1A" : "#FFF";
  return <View style={[
    styles.panel,
    compact && styles.panelCompact,
    outside && styles.panelOutside,
    rail && styles.panelRail,
  ]}>
    <Action label={liked ? "Unlike Clip" : "Like Clip"} active={liked} count={likes} compact={compact} outside={outside} dark={dark} onPress={onLike}>
      <Heart size={compact ? 21 : 23} color={liked ? "#FF4B8B" : iconColor} fill={liked ? "#E91E63" : "transparent"} />
    </Action>
    <Action label="Share Clip" compact={compact} outside={outside} dark={dark} onPress={onShare} animation="ripple"><Send size={compact ? 20 : 22} color={iconColor} /></Action>
    <Action label={saved ? "Remove saved Clip" : "Save Clip"} active={saved} compact={compact} outside={outside} dark={dark} onPress={onSave}>
      <Bookmark size={compact ? 20 : 22} color={saved ? "#FF4B8B" : iconColor} fill={saved ? "#E91E63" : "transparent"} />
    </Action>
    {showAvatar ? <Pressable accessibilityRole="button" accessibilityLabel={`${vendorName} profile`} onPress={onVendor} style={[styles.avatar, compact && styles.avatarCompact]}>
      {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarLetter}>{vendorName.slice(0, 1).toUpperCase()}</Text>}
      {!outside ? <View style={styles.avatarPlus}><Text style={styles.plus}>+</Text></View> : null}
    </Pressable> : null}
  </View>;
});

const styles = StyleSheet.create({
  panel: { position: "absolute", right: 9, bottom: 20, alignItems: "center", gap: 11, zIndex: 4 },
  panelCompact: { right: 7, bottom: 15, gap: 8 },
  panelOutside: { position: "relative", right: undefined, bottom: undefined, width: "100%", minHeight: 58, flexDirection: "row", justifyContent: "flex-start", gap: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(128,128,128,.28)" },
  panelRail: { width: 58, minHeight: 0, flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 10, paddingTop: 0, borderTopWidth: 0 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#E91E63", borderWidth: 2, borderColor: "#FFF", overflow: "visible" },
  avatarCompact: { width: 44, height: 44, borderRadius: 22 },
  avatarImage: { width: "100%", height: "100%", borderRadius: 24 },
  avatarLetter: { color: "#FFF", fontSize: 18, fontWeight: "900" },
  avatarPlus: { position: "absolute", bottom: -6, width: 19, height: 19, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#E91E63", borderWidth: 1.5, borderColor: "#FFF" },
  plus: { color: "#FFF", fontSize: 14, fontWeight: "900", lineHeight: 15 },
  actionWrap: { minWidth: 52, alignItems: "center" },
  actionWrapCompact: { minWidth: 46 },
  actionWrapOutside: { width: 52, minWidth: 52 },
  action: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  actionCompact: { width: 44, height: 44 },
  actionOutside: { width: 48, height: 48 },
  circle: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(9,7,9,.52)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,.28)" },
  circleCompact: { width: 42, height: 42, borderRadius: 21 },
  circleOutside: { width: 48, height: 48, borderRadius: 24, borderWidth: 1 },
  activeCircle: { backgroundColor: "rgba(233,30,99,.2)", borderColor: "rgba(255,116,166,.6)" },
  ripple: { position: "absolute", width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(233,30,99,.35)" },
  rippleCompact: { width: 42, height: 42, borderRadius: 21 },
  count: { color: "#FFF", fontSize: 10, fontWeight: "800", marginTop: 2, textShadowColor: "rgba(0,0,0,.7)", textShadowRadius: 4 },
});
