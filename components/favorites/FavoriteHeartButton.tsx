import React, { useEffect, useRef, useState } from "react";
import {
  Pressable,
  type Insets,
  type StyleProp,
  type View,
  type ViewStyle,
} from "react-native";
import { Heart } from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import type { FavoriteSourceRef } from "@/context/FavoritesContext";
import { brandPalette } from "@/constants/brandPalette";

const PINK = brandPalette.light.primary;
const AnimatedHeart = Animated.createAnimatedComponent(Heart);

type FavoriteHeartButtonProps = {
  favorite: boolean;
  accessibilityLabel: string;
  onToggle: (source: FavoriteSourceRef) => void;
  style: StyleProp<ViewStyle>;
  hoveredStyle?: StyleProp<ViewStyle>;
  pressedStyle?: StyleProp<ViewStyle>;
  activeStyle?: StyleProp<ViewStyle>;
  size?: number;
  color?: string;
  activeColor?: string;
  activeIconColor?: string;
  hitSlop?: number | Insets;
};

export default function FavoriteHeartButton({
  favorite,
  accessibilityLabel,
  onToggle,
  style,
  hoveredStyle,
  pressedStyle,
  activeStyle,
  size = 18,
  color = PINK,
  activeColor = PINK,
  activeIconColor,
  hitSlop,
}: FavoriteHeartButtonProps) {
  const sourceRef = useRef<View>(null);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const reducedMotion = useReducedMotion();
  const previousFavorite = useRef(favorite);

  useEffect(() => {
    if (favorite === previousFavorite.current) return;
    previousFavorite.current = favorite;

    if (reducedMotion) {
      scale.value = 1;
      return;
    }

    scale.value = favorite
      ? withSequence(
          withTiming(1.3, { duration: 120 }),
          withSpring(1, { damping: 12, stiffness: 230 }),
        )
      : withSequence(
          withTiming(0.78, { duration: 100 }),
          withSpring(1, { damping: 14, stiffness: 240 }),
        );
  }, [favorite, reducedMotion, scale]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const iconColor = favorite ? (activeIconColor ?? activeColor) : color;

  return (
    <Pressable
      ref={sourceRef}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: favorite }}
      hitSlop={hitSlop}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => onToggle(sourceRef)}
      style={[
        style,
        favorite && activeStyle,
        (hovered || focused) && hoveredStyle,
        pressed && pressedStyle,
      ]}
    >
      <Animated.View style={iconStyle}>
        <AnimatedHeart
          size={size}
          color={iconColor}
          fill={favorite ? iconColor : "transparent"}
          strokeWidth={1.9}
        />
      </Animated.View>
    </Pressable>
  );
}
