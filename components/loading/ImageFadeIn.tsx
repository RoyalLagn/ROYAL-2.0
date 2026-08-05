import React, { useState } from "react";
import { Image, type ImageProps, type ImageStyle, StyleSheet, View, type StyleProp } from "react-native";
import { ImageOff } from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useAppTheme } from "@/components/ThemeProvider";
import { MotionDuration, MotionEasing } from "@/utils/motion";
import { SkeletonBone } from "@/components/loading/Skeleton";

const AnimatedImage = Animated.createAnimatedComponent(Image);

type ImageFadeInProps = Omit<ImageProps, "style"> & {
  style?: StyleProp<ImageStyle>;
  /** Radius applied to both the loading placeholder and the image itself. */
  radius?: number;
};

/**
 * Drop-in replacement for a plain <Image> that reserves its box (via the
 * caller's own style, unchanged), shows a shimmer placeholder while the
 * network image loads, fades the image in once it has, and falls back to a
 * neutral "image unavailable" tile on error -- for portfolio/album/clip
 * thumbnails where there is no sensible static fallback *asset* (unlike
 * vendor cards, which use SafeImage with a category fallback image).
 */
export default function ImageFadeIn({ style, source, radius = 0, onLoad, onError, ...rest }: ImageFadeInProps) {
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const reducedMotion = useReducedMotion();
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const opacity = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View style={[styles.wrap, { borderRadius: radius }, style as StyleProp<ImageStyle>]}>
      {status !== "loaded" ? (
        <View style={StyleSheet.absoluteFillObject}>
          {status === "error" ? (
            <View style={[styles.errorTile, { backgroundColor: isDark ? "#26202A" : "#F3E7EC", borderRadius: radius }]}>
              <ImageOff size={18} color={isDark ? "#6B5F68" : "#B79AA5"} />
            </View>
          ) : (
            <SkeletonBone width="100%" height="100%" radius={radius} style={StyleSheet.absoluteFillObject} />
          )}
        </View>
      ) : null}
      <AnimatedImage
        {...rest}
        source={source}
        style={[StyleSheet.absoluteFillObject, { borderRadius: radius }, animatedStyle]}
        onLoad={(event) => {
          setStatus("loaded");
          opacity.value = reducedMotion ? 1 : withTiming(1, { duration: MotionDuration.fast, easing: MotionEasing.standard });
          onLoad?.(event);
        }}
        onError={(event) => {
          setStatus("error");
          onError?.(event);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden" },
  errorTile: { flex: 1, alignItems: "center", justifyContent: "center" },
});
