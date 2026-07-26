import React from "react";
import { View, type ViewProps } from "react-native";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";

export function ResponsiveCard({ style, ...props }: ViewProps) {
  const { cardPadding, cardRadius } = useResponsiveLayout();
  return (
    <View
      {...props}
      className={`bg-card/95 border border-border ${props.className ?? ""}`}
      style={[{ padding: cardPadding, borderRadius: cardRadius }, style]}
    />
  );
}
