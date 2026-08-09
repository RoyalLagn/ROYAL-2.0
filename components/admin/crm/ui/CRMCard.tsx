import React from "react";
import { View, type ViewStyle } from "react-native";
import Pressable from "@/components/InteropSafePressable";

type CRMCardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  className?: string;
  style?: ViewStyle;
};

// Shared card shell for the Vendor Acquisition CRM. Uses the same flat
// bg-card/border-border surface as the rest of admin (ResponsiveCard,
// DashboardWidget) instead of a bespoke gradient-hairline "glass" treatment,
// so CRM screens read as one system with the rest of the dashboard.
export function CRMCard({ children, onPress, className = "", style }: CRMCardProps) {
  const content = (
    <View className={`bg-card border border-border rounded-2xl ${className}`} style={style}>
      {children}
    </View>
  );

  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      className="min-h-11"
      style={({ pressed }) => (pressed ? { opacity: 0.85, transform: [{ scale: 0.99 }] } : undefined)}
    >
      {content}
    </Pressable>
  );
}
