import React from "react";
import {
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
} from "react-native";

type Props = {
  name: string;
  count?: number;
  style?: StyleProp<TextStyle>;
  showCount?: boolean;
};

export default function CategoryBadge({
  name,
  count,
  style,
  showCount = false,
}: Props) {
  return (
    <Text numberOfLines={1} style={[styles.badge, style]}>
      {name}
      {showCount && typeof count === "number" ? ` (${count})` : ""}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexShrink: 1,
    minWidth: 0,
  },
});
