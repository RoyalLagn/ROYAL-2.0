import React, { useEffect } from "react";
import { type ImageURISource, Platform, Pressable, StyleSheet, Text, type TextStyle, type ViewStyle, View, } from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, {
  useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, } from "react-native-reanimated";
import SafeImage from "@/components/SafeImage";
import { brandColors } from "@/constants/brandPalette";
import { fonts, typeScale, typeLeading } from "@/constants/typography";
import { MotionDistance, MotionPress, MotionTiming } from "@/utils/motion";

type HomeCategoryCardProps = {
  name: string;
  image?: number | ImageURISource;
  itemWidth: number;
  cardWidth: number;
  dark: boolean;
  desktop?: boolean;
  onPress: () => void;
  animateEntrance?: boolean;
  entranceDelay?: number;
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
  dark,
  desktop = false,
  onPress,
  animateEntrance = false,
  entranceDelay = 0,
}: HomeCategoryCardProps) {
  const reducedMotion = useReducedMotion();
  const pressed = useSharedValue(1);
  const hover = useSharedValue(0);
  const entrance = useSharedValue(animateEntrance ? 0 : 1);
  const colors = brandColors(dark);
  const compact = itemWidth < 100;
  const cardPadding = compact ? 4 : desktop ? 0 : 10;
  const cardHeight = Math.round(cardWidth / (compact ? 0.92 : desktop ? 0.72 : 0.82));
  // Slimmer inset so the photo fills more of the frame.
  const framePadding = Math.min(5, Math.max(3.5, Math.round(cardWidth * 0.055)));
  const outerRadius = compact ? 14 : Math.min(20, Math.max(15, Math.round(cardWidth * 0.18)));
  const innerRadius = Math.max(12, outerRadius - framePadding);
  const sparkleSize = Math.min(11, Math.max(7, Math.round(cardWidth * 0.14)));
  const isLongSingleWord = !/\s/.test(name) && name.length > 10;
  const borderColor = dark ? `${colors.frameBorder}CC` : colors.frameBorder;
  const sparkleColor = dark ? "#FFFFFFCC" : colors.primaryForeground;
  const frameFill = colors.frameFill;

  useEffect(() => {
    if (!animateEntrance) {
      entrance.value = 1;
      return;
    }
    entrance.value = 0;
    entrance.value = withDelay(entranceDelay, withTiming(1, MotionTiming.fast));
  }, [animateEntrance, entrance, entranceDelay]);

  const pressStyle = useAnimatedStyle<ViewStyle>(() => ({
    opacity: entrance.value,
    transform: [
      { translateY: reducedMotion ? 0 : (1 - entrance.value) * MotionDistance.cardEnter - hover.value * 2 },
      { scale: pressed.value },
    ],
  }));

  const handlePressIn = () => {
    pressed.value = reducedMotion ? MotionPress.scale : withTiming(MotionPress.scale, MotionTiming.press);
  };

  const handlePressOut = () => {
    pressed.value = reducedMotion ? 1 : withTiming(1, MotionTiming.press);
  };

  const handleHoverIn = () => {
    hover.value = reducedMotion ? 0 : withTiming(1, MotionTiming.press);
  };

  const handleHoverOut = () => {
    hover.value = withTiming(0, MotionTiming.press);
  };

  const labelWebStyle = Platform.OS === "web"
    ? ({ wordBreak: "normal", overflowWrap: "normal", hyphens: "none" } as TextStyle)
    : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Browse ${name}`}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onFocus={handleHoverIn}
      onBlur={handleHoverOut}
      style={[styles.pressable, { width: itemWidth }]}
    >
      <Animated.View
        style={[
          styles.animatedItem,
          compact && styles.animatedItemCompact,
          {
            padding: cardPadding,
            backgroundColor: dark ? colors.card : "#FFFFFF",
            shadowColor: dark ? "#000000" : "#8A4560",
          },
          desktop && styles.animatedItemDesktop,
          pressStyle,
        ]}
      >
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
                backgroundColor: dark ? "#17131A" : colors.card,
              },
            ]}
          >
            {image ? (
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

          {/* Soft sparkles on the shared pink frame border */}
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
          minimumFontScale={0.62}
          numberOfLines={2}
          style={[
            styles.label,
            cardWidth < 60 && styles.labelNarrow,
            isLongSingleWord && styles.singleWordLabel,
            compact && styles.labelCompact,
            desktop && styles.labelDesktop,
            { color: dark ? "#E5DCE1" : colors.foreground },
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
  },
  animatedItem: {
    width: "100%",
    alignItems: "center",
    padding: 10,
    borderRadius: 16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.04,
    elevation: 2,
  },
  animatedItemCompact: { shadowOpacity: 0, elevation: 0 },
  animatedItemDesktop: { backgroundColor: "transparent", shadowOpacity: 0, elevation: 0 },
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
  sparkle: {
    position: "absolute",
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    width: "100%",
    height: 30,
    marginTop: 12,
    paddingHorizontal: 1,
    fontFamily: fonts.sans.bold,
    fontSize: typeScale.caption,
    lineHeight: typeLeading.caption,
    letterSpacing: -0.16,
    textAlign: "center",
    includeFontPadding: false,
  },
  labelCompact: { height: 27, marginTop: 6, fontSize: 10, lineHeight: 12, letterSpacing: -0.22 },
  labelDesktop: { height: 32, marginTop: 12, fontSize: 14, lineHeight: 18 },
  labelNarrow: {
    fontSize: typeScale.caption,
    lineHeight: typeLeading.caption,
  },
  singleWordLabel: { fontSize: typeScale.caption, letterSpacing: -0.32 },
});
