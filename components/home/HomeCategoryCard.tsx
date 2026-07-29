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
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import SafeImage from "@/components/SafeImage";

const PINK = "#E91E63";

const FRAME_TONES = [
  { gradient: ["#FFF3E3", "#F9DFC2"] as const, border: "#EDC79C", shadow: "#DDAF7C" },
  { gradient: ["#FFEAF3", "#F7D5E3"] as const, border: "#EAB5C9", shadow: "#DF91AF" },
  { gradient: ["#EDF4FF", "#D9E7FA"] as const, border: "#BCD0EB", shadow: "#91AED6" },
  { gradient: ["#EEF6EB", "#DDEBD8"] as const, border: "#BBD0B5", shadow: "#95B28E" },
  { gradient: ["#F3EBFF", "#E5D7F6"] as const, border: "#CAB3E6", shadow: "#AA8DCE" },
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

export default function HomeCategoryCard({
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
  const cardHeight = Math.round(cardWidth / 0.78);
  const framePadding = Math.min(9, Math.max(6, Math.round(cardWidth * 0.11)));
  const outerRadius = Math.min(24, Math.max(17, Math.round(cardWidth * 0.28)));
  const innerRadius = Math.max(13, outerRadius - framePadding);
  const isLongSingleWord = !/\s/.test(name) && name.length > 10;
  const frameColors = dark
    ? (["#201B23", "#201B23"] as const)
    : palette.gradient;

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
        <LinearGradient
          colors={frameColors}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={[
            styles.frame,
            {
              width: cardWidth,
              height: cardHeight,
              padding: framePadding,
              borderRadius: outerRadius,
              borderColor: dark ? `${palette.shadow}66` : palette.border,
              shadowColor: palette.shadow,
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
        </LinearGradient>

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
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.13,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  imageShell: {
    width: "100%",
    flex: 1,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.94)",
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
