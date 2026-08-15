import React, { useState } from "react";
import { Platform, type PressableStateCallbackType, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { ChevronRight } from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";
import Pressable from "@/components/InteropSafePressable";
import { profileScreenStyles as styles } from "./profileScreenStyles";

export const mobilePressedScale = ({ pressed }: PressableStateCallbackType) =>
  pressed && Platform.OS !== "web"
    ? { transform: [{ scale: 0.98 }] }
    : undefined;

type AccountOptionProps = {
  icon: React.ElementType;
  title: string;
  description: string;
  onPress: () => void;
  tile?: boolean;
  tileWidth?: `${number}%`;
  showNativeSeparator?: boolean;
};

export function AccountOption({
  icon: Icon,
  title,
  description,
  onPress,
  tile = false,
  tileWidth,
  showNativeSeparator = false,
}: AccountOptionProps) {
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const [isHovered, setIsHovered] = useState(false);
  const webTransition = Platform.OS === "web"
    ? ({
        transitionDuration: "200ms",
        transitionProperty: "background-color, border-color, box-shadow, transform",
        transitionTimingFunction: "ease-out",
      } as never)
    : undefined;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      onPress={onPress}
      onHoverIn={() => setIsHovered(true)}
      onHoverOut={() => setIsHovered(false)}
      className={Platform.OS === "web"
        ? tile
          ? "group bg-card border border-border/80 rounded-2xl p-5 min-h-[144px] justify-between hover:border-primary/35 hover:bg-muted/40 hover:-translate-y-0.5 hover:shadow-soft-1 active:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-all duration-200 ease-out"
          : "group min-h-[72px] px-4 py-3.5 flex-row items-center border-b border-border/70 last:border-b-0 hover:bg-muted/50 active:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 transition-colors duration-200 ease-out"
        : undefined}
      style={({ pressed }) => [
        Platform.OS !== "web" && (tile ? styles.nativeTile : styles.nativeSettingsRow),
        Platform.OS !== "web" && tile && (isDark ? styles.nativeSurfaceDark : styles.nativeSurfaceLight),
        Platform.OS !== "web" && !tile && showNativeSeparator && (isDark ? styles.nativeSeparatorDark : styles.nativeSeparatorLight),
        tile && tileWidth ? { width: tileWidth } : undefined,
        webTransition,
        Platform.OS === "web" && isHovered
          ? ({
              backgroundColor: isDark ? "#292126" : "#FFF4F8",
              borderColor: isDark ? "rgba(236,72,153,0.32)" : "rgba(233,30,99,0.24)",
              boxShadow: tile
                ? isDark
                  ? "0 12px 26px rgba(0,0,0,0.22)"
                  : "0 12px 26px rgba(116,62,86,0.11)"
                : "none",
              transform: tile ? [{ translateY: -2 }] : undefined,
            } as never)
          : undefined,
        pressed && Platform.OS !== "web" ? { transform: [{ scale: 0.98 }] } : undefined,
      ]}
    >
      <View className={tile ? "flex-row items-start" : "flex-row items-center flex-1 min-w-0"}>
        <View className={tile
          ? "w-11 h-11 rounded-2xl bg-primary/10 items-center justify-center mr-3.5"
          : "w-10 h-10 rounded-xl bg-primary/10 items-center justify-center mr-3"}
        >
          <Icon
            size={tile ? 20 : 18}
            color={isHovered
              ? isDark ? "#F472B6" : "#D81B60"
              : isDark ? "rgba(236,72,153,0.82)" : "rgba(233,30,99,0.80)"}
            strokeWidth={1.9}
          />
        </View>
        <View className="flex-1 min-w-0">
          <Text className={tile
            ? "text-foreground text-body font-semibold mb-1"
            : "text-foreground text-body font-semibold"}
          >
            {title}
          </Text>
          <Text className="text-muted-foreground text-xs leading-[18px]" numberOfLines={tile || Platform.OS !== "web" ? 2 : 1}>
            {description}
          </Text>
        </View>
      </View>
      <Animated.View
        className={tile ? "self-end mt-3" : "ml-3"}
        style={[
          { transform: [{ translateX: isHovered && Platform.OS === "web" ? 3 : 0 }] },
          webTransition,
        ]}
      >
        <ChevronRight
          size={17}
          color={isHovered
            ? isDark ? "#F472B6" : "#D81B60"
            : isDark ? "#A0A0A5" : "#787178"}
        />
      </Animated.View>
    </Pressable>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <View className="mb-4">
      <View className="flex-row items-center mb-2">
        <View className="w-5 h-0.5 rounded-full bg-primary mr-2" />
        <Text className="text-primary text-2xs font-bold uppercase tracking-[1.4px]">{eyebrow}</Text>
      </View>
      <Text className={description ? "text-foreground text-xl font-bold mb-1" : "text-foreground text-xl font-bold"}>
        {title}
      </Text>
      {description ? <Text className="text-muted-foreground text-sm leading-5">{description}</Text> : null}
    </View>
  );
}
