import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Tag } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const PINK = "#E91E63";

type StickyQuoteBarProps = {
  price: string;
  dark?: boolean;
  priceLabel?: string;
  buttonLabel?: string;
  disabled?: boolean;
  onRequestQuote: () => void;
};

export const STICKY_QUOTE_BAR_MIN_HEIGHT = 92;

export default function StickyQuoteBar({
  price,
  dark = false,
  priceLabel = "Starting from",
  buttonLabel = "Request Quote",
  disabled = false,
  onRequestQuote,
}: StickyQuoteBarProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 380;
  const bottomInset = Math.max(insets.bottom, Platform.OS === "ios" ? 6 : 8);
  const surface = dark ? "#211D1F" : "#FFFCFD";
  const text = dark ? "#FFF7FA" : "#241A20";
  const muted = dark ? "#BCAEB5" : "#756970";
  const border = dark ? "#4A353E" : "#F1CFDA";

  return (
    <View
      accessibilityRole="toolbar"
      style={[
        styles.safeWrap,
        {
          paddingBottom: bottomInset,
          backgroundColor: surface,
          borderColor: border,
        },
      ]}
    >
      <View style={[styles.content, width >= 900 && styles.contentWide]}>
        <View style={styles.priceGroup}>
          <View style={[styles.iconCircle, { backgroundColor: dark ? "#3B2931" : "#FFF0F5" }]}>
            <Tag size={compact ? 19 : 22} color={PINK} strokeWidth={1.8} />
          </View>
          <View style={styles.priceCopy}>
            <Text numberOfLines={1} style={[styles.label, { color: muted }]}>{priceLabel}</Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={[styles.price, compact && styles.priceCompact, { color: text }]}
            >
              {price}
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${buttonLabel}, ${priceLabel} ${price}`}
          disabled={disabled}
          onPress={onRequestQuote}
          style={({ pressed, hovered }) => [
            styles.button,
            compact && styles.buttonCompact,
            hovered && Platform.OS === "web" && !disabled && styles.buttonHovered,
            pressed && !disabled && styles.buttonPressed,
            disabled && styles.buttonDisabled,
          ]}
        >
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
            style={[styles.buttonText, compact && styles.buttonTextCompact]}
          >
            {buttonLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const serif = Platform.select({ ios: "Georgia", android: "serif", web: "Georgia, serif" });

const styles = StyleSheet.create({
  safeWrap: {
    position: "absolute",
    zIndex: 30,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 10,
    shadowColor: "#8D5368",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -5 },
    elevation: 14,
  },
  content: {
    width: "100%",
    minHeight: 64,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  contentWide: { maxWidth: 1120 },
  priceGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconCircle: {
    width: 48,
    height: 48,
    flexShrink: 0,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  priceCopy: { flex: 1, minWidth: 0 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  price: {
    marginTop: 1,
    fontFamily: serif,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  priceCompact: { fontSize: 16, lineHeight: 21 },
  button: {
    width: "46%",
    maxWidth: 360,
    minWidth: 148,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: "#F5A2BD",
    backgroundColor: PINK,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    shadowColor: PINK,
    shadowOpacity: 0.2,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonCompact: { minWidth: 132, height: 48, paddingHorizontal: 12 },
  buttonHovered: { backgroundColor: "#D91657", transform: [{ translateY: -1 }] },
  buttonPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    color: "#FFFFFF",
    fontFamily: serif,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
  },
  buttonTextCompact: { fontSize: 16 },
});
