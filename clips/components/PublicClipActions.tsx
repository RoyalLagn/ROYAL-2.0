import React, { useCallback } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle, useReducedMotion, useSharedValue, withSequence,
  withSpring, withTiming,
} from "react-native-reanimated";
import { Bookmark, Heart, Share2 } from "lucide-react-native";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function compactCount(count: number) {
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}K`;
}

const Action = React.memo(function Action({
  label, count, active, children, onPress, animation = "spring",
}: {
  label: string;
  count?: number;
  active?: boolean;
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
  return <View style={styles.actionWrap}>
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => { animate(); onPress(); }}
      style={[styles.action, animatedStyle]}
    >
      <Animated.View pointerEvents="none" style={[styles.ripple, glowStyle]} />
      <View style={[styles.circle, active && styles.activeCircle]}>{children}</View>
    </AnimatedPressable>
    {typeof count === "number" && <Text style={styles.count}>{compactCount(count)}</Text>}
  </View>;
});

export const PublicClipActions = React.memo(function PublicClipActions({
  avatarUrl, vendorName, liked, saved, likes,
  onVendor, onLike, onSave, onShare,
}: {
  avatarUrl: string | null;
  vendorName: string;
  liked: boolean;
  saved: boolean;
  likes: number;
  onVendor: () => void;
  onLike: () => void;
  onSave: () => void;
  onShare: () => void;
}) {
  return <View style={styles.panel}>
    <Action label={liked ? "Unlike Clip" : "Like Clip"} active={liked} count={likes} onPress={onLike}>
      <Heart size={23} color={liked ? "#FF4B8B" : "#FFF"} fill={liked ? "#E91E63" : "transparent"} />
    </Action>
    <Action label="Share Clip" onPress={onShare} animation="ripple"><Share2 size={22} color="#FFF" /></Action>
    <Action label={saved ? "Remove saved Clip" : "Save Clip"} active={saved} onPress={onSave}>
      <Bookmark size={22} color={saved ? "#FF4B8B" : "#FFF"} fill={saved ? "#E91E63" : "transparent"} />
    </Action>
    <Pressable accessibilityRole="button" accessibilityLabel={`${vendorName} profile`} onPress={onVendor} style={styles.avatar}>
      {avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarLetter}>{vendorName.slice(0, 1).toUpperCase()}</Text>}
      <View style={styles.avatarPlus}><Text style={styles.plus}>+</Text></View>
    </Pressable>
  </View>;
});

const styles = StyleSheet.create({
  panel: { position: "absolute", right: 3, bottom: 22, alignItems: "center", gap: 15, zIndex: 4 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#E91E63", borderWidth: 2, borderColor: "#FFF", overflow: "visible" },
  avatarImage: { width: "100%", height: "100%", borderRadius: 24 },
  avatarLetter: { color: "#FFF", fontSize: 18, fontWeight: "900" },
  avatarPlus: { position: "absolute", bottom: -6, width: 19, height: 19, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#E91E63", borderWidth: 1.5, borderColor: "#FFF" },
  plus: { color: "#FFF", fontSize: 14, fontWeight: "900", lineHeight: 15 },
  actionWrap: { minWidth: 52, alignItems: "center" },
  action: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  circle: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(9,7,9,.52)", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,.28)" },
  activeCircle: { backgroundColor: "rgba(233,30,99,.2)", borderColor: "rgba(255,116,166,.6)" },
  ripple: { position: "absolute", width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(233,30,99,.35)" },
  count: { color: "#FFF", fontSize: 10, fontWeight: "800", marginTop: 2, textShadowColor: "rgba(0,0,0,.7)", textShadowRadius: 4 },
});
