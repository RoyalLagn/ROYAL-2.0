import React from "react";
import { Pressable, Text, View } from "react-native";
import { RefreshCw } from "lucide-react-native";
import { DashboardEmpty, DashboardError, DashboardSkeleton } from "./DashboardStates";
import { ResponsiveCard } from "@/components/responsive/ResponsiveCard";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import { typeStyles } from "@/constants/typography";
import { royalAdmin } from "@/components/admin/dashboard/adminDashboardTheme";

type Props = {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyMessage?: string;
  onRefresh?: () => void;
  allowOverflow?: boolean;
  royal?: boolean;
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
  allowOverflow = false,
  royal = false,
  children,
}: Props) {
  const { cardPadding, iconSize, isPhone } = useResponsiveLayout();
  const horizontalPadding = isPhone ? Math.max(16, cardPadding) : Math.max(22, cardPadding);
  return (
    <ResponsiveCard
      className={`${allowOverflow ? "overflow-visible" : "overflow-hidden"} bg-card`}
      style={{
        padding: 0,
        borderRadius: royal ? 17 : 20,
        backgroundColor: royal ? royalAdmin.surface : undefined,
        borderColor: royal ? royalAdmin.border : undefined,
        zIndex: allowOverflow ? 10 : undefined,
        shadowColor: royal ? royalAdmin.navy : "#7D3D58",
        shadowOffset: { width: 0, height: royal ? 5 : 10 },
        shadowOpacity: royal ? 0.035 : 0.045,
        shadowRadius: royal ? 14 : 22,
        elevation: 1,
      }}
    >
      <View
        className="flex-row items-center border-b border-border"
        style={{ paddingHorizontal: horizontalPadding, paddingVertical: isPhone ? 15 : royal ? 14 : 19, borderBottomColor: royal ? royalAdmin.border : undefined }}
      >
        {Icon ? <View className="w-10 h-10 rounded-xl items-center justify-center mr-3.5" style={royal ? { backgroundColor: royalAdmin.navy } : undefined}><Icon size={Math.max(17, iconSize - 2)} color={royal ? "#FFFFFF" : undefined} className={royal ? undefined : "text-primary"} /></View> : null}
        <View className="flex-1">
          <Text className={royal ? undefined : "text-foreground font-bold"} style={[typeStyles.cardTitle, royal && { color: royalAdmin.navyDeep }]} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text className={royal ? undefined : "text-muted-foreground mt-0.5"} style={[typeStyles.bodyCompact, royal && { color: royalAdmin.navyMuted, marginTop: 2 }]} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {onRefresh ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Refresh ${title}`}
            className="min-w-11 min-h-11 rounded-xl border border-border bg-background items-center justify-center active:bg-muted"
            style={({ pressed }) => royal ? [
              { width: 46, height: 46, borderRadius: 13, borderWidth: 1, borderColor: royalAdmin.border, backgroundColor: "#F8FBFF", alignItems: "center", justifyContent: "center" },
              pressed ? { transform: [{ scale: .97 }], opacity: .82 } : null,
            ] : ({ transitionProperty: "transform, opacity", transitionDuration: "160ms", transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)", ...(pressed ? { transform: [{ scale: 0.97 }], opacity: 0.82 } : {}) } as any)}
            onPress={onRefresh}
          >
            <RefreshCw size={17} color={royal ? royalAdmin.navy : undefined} className={royal ? undefined : "text-muted-foreground"} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: horizontalPadding, paddingVertical: isPhone ? 16 : royal ? 12 : 20 }}>
        {loading ? <DashboardSkeleton />
          : error ? <DashboardError message={error} />
            : empty ? <DashboardEmpty message={emptyMessage} />
              : children}
      </View>
    </ResponsiveCard>
  );
}
