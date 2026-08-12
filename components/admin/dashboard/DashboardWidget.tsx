import React from "react";
import { Pressable, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import { DashboardEmpty, DashboardError, DashboardSkeleton } from "./DashboardStates";
import { ResponsiveCard } from "@/components/responsive/ResponsiveCard";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import { typeStyles } from "@/constants/typography";

type Props = {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
  onRefresh?: () => void;
  children: React.ReactNode;
};

export function DashboardWidget({
  title,
  subtitle,
  icon: Icon,
  loading,
  error,
  empty,
  emptyMessage = "No information is available.",
  onRefresh,
  children,
}: Props) {
  const { iconSize, isPhone } = useResponsiveLayout();
  return (
    <ResponsiveCard className="overflow-hidden">
      <View className={`flex-row items-center ${isPhone ? "mb-3" : "mb-5"}`}>
        {Icon ? <View className="w-9 h-9 rounded-lg bg-primary/10 items-center justify-center mr-3"><Icon size={Math.max(17, iconSize - 3)} className="text-primary" /></View> : null}
        <View className="flex-1">
          <Text className="text-foreground font-bold" style={typeStyles.cardTitle} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text className="text-muted-foreground mt-0.5" style={typeStyles.bodyCompact} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {onRefresh ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Refresh ${title}`} className="min-w-11 min-h-11 rounded-xl items-center justify-center active:bg-muted" onPress={onRefresh}>
            <RefreshCw size={17} className="text-muted-foreground" />
          </Pressable>
        ) : null}
      </View>
      {loading ? <DashboardSkeleton />
        : error ? <DashboardError message={error} />
          : empty ? <DashboardEmpty message={emptyMessage} />
            : children}
    </ResponsiveCard>
  );
}
