import React from "react";
import { Text, View } from "react-native";
export function KPIChip({ label, value, tone = "neutral" }: { label: string; value?: string | number; tone?: "neutral" | "success" | "warning" | "danger" | "primary" }) {
  const styles = { neutral: "bg-muted text-muted-foreground", success: "bg-emerald-500/10 text-emerald-500", warning: "bg-amber-500/10 text-amber-500", danger: "bg-red-500/10 text-red-500", primary: "bg-primary/10 text-primary" };
  const [background, foreground] = styles[tone].split(" ");
  return <View className={`min-h-7 px-2.5 items-center justify-center rounded-full ${background}`}><Text className={`text-metadata font-inter-semibold ${foreground}`} style={{ letterSpacing: 0.04 }}>{label}{value !== undefined ? ` ${value}` : ""}</Text></View>;
}
