import React from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Check, MoreVertical, Square } from "lucide-react-native";
import type { AdminVendorRecord, VendorHealthMetrics } from "@/types/adminVendors";
import { ResponsiveCard } from "@/components/responsive/ResponsiveCard";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import { KPIChip } from "@/components/admin/ui/KPIChip";

export const VendorCard = React.memo(function VendorCard({
  item,
  selected,
  onSelect,
  onView,
  onActions,
  health,
}: {
  item: AdminVendorRecord;
  selected: boolean;
  onSelect: () => void;
  onView: () => void;
  onActions: () => void;
  health?: VendorHealthMetrics;
}) {
  const { isPhone } = useResponsiveLayout();
  return (
    <ResponsiveCard>
      <View className="flex-row items-start">
        <Pressable className="min-w-11 min-h-11 items-center justify-center mr-1" onPress={onSelect} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}>
          {selected ? <View className="w-6 h-6 rounded-md bg-primary items-center justify-center"><Check size={15} color="#FFF" /></View> : <Square size={23} className="text-muted-foreground" />}
        </Pressable>
        {item.logo_url
          ? <Image source={{ uri: item.logo_url }} className="w-14 h-14 rounded-2xl bg-muted" resizeMode="cover" />
          : <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center"><Text className="text-primary font-bold">{item.business_name.slice(0, 2).toUpperCase()}</Text></View>}
        <Pressable className="flex-1 min-w-0 ml-3" onPress={onView}>
          <Text className="text-foreground font-bold" numberOfLines={1}>{item.business_name}</Text>
          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{item.owner_name}</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>{item.email || "No email"} · {item.phone || "No phone"}</Text>
        </Pressable>
        <Pressable className="min-w-11 min-h-11 items-center justify-center" onPress={onActions}>
          <MoreVertical size={20} className="text-muted-foreground" />
        </Pressable>
      </View>
      <View className={`mt-4 gap-2 ${isPhone ? "" : "flex-row flex-wrap"}`}>
        <View className="flex-row flex-wrap gap-2">
          <Badge text={item.application_status} tone={item.application_status === "approved" ? "success" : item.application_status === "rejected" ? "danger" : "warning"} />
          <Badge text={item.is_verified ? "Verified" : "Unverified"} tone={item.is_verified ? "success" : "neutral"} />
          <Badge text={item.management_status} tone={item.management_status === "active" ? "success" : "danger"} />
          <Badge text={item.plan_name} tone={item.plan_name.toLowerCase() === "free" ? "neutral" : "premium"} />
        </View>
        <View className="flex-1" />
        <Text className="text-muted-foreground text-xs" numberOfLines={1}>
          {item.category_name || "Uncategorized"} · {item.city}, {item.state}
        </Text>
      </View>
      {health ? <View className="mt-3">
        <View className="flex-row flex-wrap gap-2">
          <KPIChip label="Health" value={`${health.healthScore}%`} tone={health.healthScore >= 70 ? "success" : health.healthScore >= 50 ? "warning" : "danger"} />
          <KPIChip label="Gallery" value={health.gallery} />
          <KPIChip label="Services" value={health.services} />
          <KPIChip label="Reviews" value={health.reviews} />
          <KPIChip label="Rating" value={health.rating.toFixed(1)} />
        </View>
        <View className="flex-row justify-between mt-3">
          <Text className="text-muted-foreground text-[10px]">Profile {health.completeness}% · {health.healthLabel}</Text>
          {health.missing.length ? <Text className="text-amber-500 text-[10px]" numberOfLines={1}>Missing: {health.missing.slice(0, 2).join(", ")}</Text> : null}
        </View>
        <View className="h-1.5 rounded-full bg-muted overflow-hidden mt-1"><View className={`h-full rounded-full ${health.completeness >= 80 ? "bg-emerald-500" : health.completeness >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${health.completeness}%` }} /></View>
      </View> : null}
      <View className="border-t border-border mt-3 pt-3 flex-row justify-between">
        <Text className="text-muted-foreground text-[10px]">Registered {new Date(item.registered_at).toLocaleDateString()}</Text>
        <Text className="text-muted-foreground text-[10px]">Updated {new Date(item.updated_at).toLocaleDateString()}</Text>
      </View>
    </ResponsiveCard>
  );
});

function Badge({ text, tone }: { text: string; tone: "success" | "warning" | "danger" | "neutral" | "premium" }) {
  const colors = {
    success: "bg-emerald-500/10 text-emerald-500",
    warning: "bg-amber-500/10 text-amber-500",
    danger: "bg-red-500/10 text-red-500",
    neutral: "bg-muted text-muted-foreground",
    premium: "bg-primary/10 text-primary",
  };
  return <View className={`px-2 py-1 rounded-full ${colors[tone]}`}><Text className={`text-[10px] font-semibold capitalize ${colors[tone].split(" ")[1]}`}>{text}</Text></View>;
}
