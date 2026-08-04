import React from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useColorScheme } from "nativewind";

type CRMCardProps = {
  children: React.ReactNode;
  onPress?: () => void;
  className?: string;
  style?: ViewStyle;
};

// Shared "premium" card shell for the Vendor Acquisition CRM: a soft rose
// gradient hairline around a rounded glass-like surface, layered on the
// existing bg-card/border-border tokens rather than introducing a new theme.
export function CRMCard({ children, onPress, className = "", style }: CRMCardProps) {
  const { colorScheme } = useColorScheme();
  const dark = colorScheme === "dark";
  const gradient = dark
    ? (["rgba(236,72,153,0.35)", "rgba(236,72,153,0.05)"] as const)
    : (["rgba(233,30,99,0.25)", "rgba(233,30,99,0.05)"] as const);

  const content = (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 24, padding: 1 }}
    >
      <View className={`bg-card rounded-[23px] shadow-soft-1 ${className}`} style={style}>
        {children}
      </View>
    </LinearGradient>
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
