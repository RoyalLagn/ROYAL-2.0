import React from "react";
import { View, type ViewProps } from "react-native";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";

export function ResponsiveSection({ style, ...props }: ViewProps) {
  const { sectionGap } = useResponsiveLayout();
  return <View {...props} style={[{ marginBottom: sectionGap }, style]} />;
}
