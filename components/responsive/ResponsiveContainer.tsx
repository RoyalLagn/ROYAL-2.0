import React from "react";
import { View, type ViewProps } from "react-native";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";

export function ResponsiveContainer({ style, ...props }: ViewProps) {
  const { contentPadding } = useResponsiveLayout();
  return (
    <View
      {...props}
      style={[{ width: "100%", paddingHorizontal: contentPadding }, style]}
    />
  );
}
