import React from "react";
import {
  type ImageURISource,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  type ViewStyle,
  View,
} from "react-native";
import { MoreHorizontal } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import SafeImage from "@/components/SafeImage";

const PINK = "#E91E63";

const FRAME_TONES = [
  { border: "#E8C49A", sparkle: "#F0D4B0", fill: "#FFF8F0" },
  { border: "#E9B4C6", sparkle: "#F3CDD9", fill: "#FFF5F8" },
  { border: "#A8C8A0", sparkle: "#C5DDBE", fill: "#F5FAF3" },
  { border: "#A8C4E0", sparkle: "#C5D8EE", fill: "#F4F8FC" },
  { border: "#C4B0E0", sparkle: "#D9CCED", fill: "#F8F5FC" },
] as const;

type HomeCategoryCardProps = {
  name: string;
  image?: number | ImageURISource;
  itemWidth: number;
  cardWidth: number;
  tone: number;
  dark: boolean;
  more?: boolean;
  onPress: () => void;
};

function Sparkle({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <Path
        d="M12 1.2L13.85 10.15L22.8 12L13.85 13.85L12 22.8L10.15 13.85L1.2 12L10.15 10.15L12 1.2Z"
        fill={color}
      />
    </Svg>
  );
}

function HomeCategoryCard({
  name,
  image,
  itemWidth,
  cardWidth,
  tone,
  dark,
  more = false,
  onPress,
}: HomeCategoryCardProps) {
  const reducedMotion = useReducedMotion();
  const pressed = useSharedValue(1);
  const palette = FRAME_TONES[tone % FRAME_TONES.length];
  // Slightly taller portrait frame than the prior 0.78 ratio.
  const cardHeight = Math.round(cardWidth / 0.70);
  // Slimmer inset so the photo fills more of the frame.
  const framePadding = Math.min(5, Math.max(3.5, Math.round(cardWidth * 0.055)));
  const outerRadius = Math.min(22, Math.max(16, Math.round(cardWidth * 0.26)));
  const innerRadius = Math.max(12, outerRadius - framePadding);
  const sparkleSize = Math.min(11, Math.max(7, Math.round(cardWidth * 0.14)));
  const isLongSingleWord = !/\s/.test(name) && name.length > 10;
  const borderColor = dark ? `${palette.border}99` : palette.border;
  const sparkleColor = dark ? `${palette.sparkle}CC` : "#FFFFFF";
  const frameFill = dark ? "#201B23" : palette.fill;

  const pressStyle = useAnimatedStyle<ViewStyle>(() => ({
    opacity: pressed.value,
    transform: [{ scale: pressed.value }],
  }));

  const handlePressIn = () => {
    pressed.value = reducedMotion ? 0.97 : withTiming(0.97, { duration: 90 });
  };

  const handlePressOut = () => {
    pressed.value = reducedMotion ? 1 : withTiming(1, { duration: 120 });
  };

  const labelWebStyle = Platform.OS === "web"
    ? ({ wordBreak: "normal", overflowWrap: "normal", hyphens: "none" } as TextStyle)
    : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={more ? "Show more categories" : `Browse ${name}`}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={[styles.pressable, { width: itemWidth }]}
    >
      <Animated.View style={[styles.animatedItem, pressStyle]}>
        <View
          style={[
            styles.frame,
            {
              width: cardWidth,
              height: cardHeight,
              padding: framePadding,
              borderRadius: outerRadius,
              borderColor,
              backgroundColor: frameFill,
            },
          ]}
        >
          <View
            style={[
              styles.imageShell,
              {
                borderRadius: innerRadius,
                backgroundColor: more
                  ? (dark ? "#311E28" : "#FFF8FB")
                  : (dark ? "#17131A" : "#FFFFFF"),
              },
            ]}
          >
            {more ? (
              <View style={styles.moreIcon}>
                <MoreHorizontal
                  size={Math.max(20, Math.round(cardWidth * 0.38))}
                  color={PINK}
                  strokeWidth={2}
                />
              </View>
            ) : image ? (
              <SafeImage
                accessibilityLabel={`${name} category`}
                source={image}
                fallbackSource={image}
                debugLabel={`${name} compact category`}
                resizeMode="cover"
                style={styles.image}
              />
            ) : null}
          </View>

          {/* Elegant sparkles centered on each side of the pastel border */}
          <View
            pointerEvents="none"
            style={[
              styles.sparkle,
              {
                top: -sparkleSize / 2,
                left: "50%",
                marginLeft: -sparkleSize / 2,
              },
            ]}
          >
            <Sparkle color={sparkleColor} size={sparkleSize} />
          </View>
          <View
            pointerEvents="none"
            style={[
              styles.sparkle,
              {
                bottom: -sparkleSize / 2,
                left: "50%",
                marginLeft: -sparkleSize / 2,
              },
            ]}
          >
            <Sparkle color={sparkleColor} size={sparkleSize} />
          </View>
          <View
            pointerEvents="none"
            style={[
              styles.sparkle,
              {
                left: -sparkleSize / 2,
                top: "50%",
                marginTop: -sparkleSize / 2,
              },
            ]}
          >
            <Sparkle color={sparkleColor} size={sparkleSize} />
          </View>
          <View
            pointerEvents="none"
            style={[
              styles.sparkle,
              {
                right: -sparkleSize / 2,
                top: "50%",
                marginTop: -sparkleSize / 2,
              },
            ]}
          >
            <Sparkle color={sparkleColor} size={sparkleSize} />
          </View>
        </View>

        <Text
          adjustsFontSizeToFit
          ellipsizeMode="tail"
          maxFontSizeMultiplier={1.15}
          minimumFontScale={0.84}
          numberOfLines={2}
          style={[
            styles.label,
            cardWidth < 60 && styles.labelNarrow,
            isLongSingleWord && styles.singleWordLabel,
            { color: dark ? "#E5DCE1" : "#30323A" },
            labelWebStyle,
          ]}
        >
          {name}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default React.memo(HomeCategoryCard);

const styles = StyleSheet.create({
  pressable: {
    alignItems: "center",
    marginBottom: 20,
  },
  animatedItem: {
    width: "100%",
    alignItems: "center",
  },
  frame: {
    borderWidth: 1.25,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  imageShell: {
    width: "100%",
    flex: 1,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  moreIcon: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sparkle: {
    position: "absolute",
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    width: "100%",
    height: 27,
    marginTop: 8,
    paddingHorizontal: 2,
    fontSize: 10,
    lineHeight: 12.5,
    fontWeight: "700",
    letterSpacing: -0.16,
    textAlign: "center",
    includeFontPadding: false,
  },
  labelNarrow: {
    fontSize: 9.4,
    lineHeight: 12,
  },
  singleWordLabel: { fontSize: 9.2, letterSpacing: -0.28 },
});
