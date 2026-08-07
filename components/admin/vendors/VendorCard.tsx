import React from "react";
import CategoryBadge from "@/components/categories/CategoryBadge";
import { Alert, Image, Linking, Pressable, Text, View } from "react-native";
import { Check, MessageCircle, MoreVertical, Phone, Square } from "lucide-react-native";
import type { AdminVendorRecord, VendorHealthMetrics } from "@/types/adminVendors";
import { ResponsiveCard } from "@/components/responsive/ResponsiveCard";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import { KPIChip } from "@/components/admin/ui/KPIChip";
import { normalizeWhatsAppPhone } from "@/services/contactActions";
import { typeScale } from "@/constants/typography";

const PHONE_UNAVAILABLE_MESSAGE = "Phone number not available.";

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
  const hasPhone = Boolean(item.phone);
  const callVendor = () => {
    if (!item.phone) { Alert.alert(PHONE_UNAVAILABLE_MESSAGE); return; }
    void Linking.openURL(`tel:${item.phone}`);
  };
  const whatsAppVendor = () => {
    if (!item.phone) { Alert.alert(PHONE_UNAVAILABLE_MESSAGE); return; }
    void Linking.openURL(`https://wa.me/${normalizeWhatsAppPhone(item.phone)}`);
  };
  return (
    <ResponsiveCard>
      <View className="flex-row items-start">
        <Pressable className="min-w-11 min-h-11 items-center justify-center mr-1" onPress={onSelect} accessibilityRole="checkbox" accessibilityState={{ checked: selected }}>
          {selected ? <View className="w-6 h-6 rounded-md bg-primary items-center justify-center"><Check size={15} color="#FFF" /></View> : <Square size={23} className="text-muted-foreground" />}
        </Pressable>
        {item.logo_url
          ? <Image source={{ uri: item.logo_url }} className="w-14 h-14 rounded-2xl bg-white" resizeMode="contain" />
          : <View className="w-14 h-14 rounded-2xl bg-primary/10 items-center justify-center"><Text className="text-primary font-bold">{item.business_name.slice(0, 2).toUpperCase()}</Text></View>}
        <Pressable className="flex-1 min-w-0 ml-3" onPress={onView}>
          <Text className="text-foreground font-bold" numberOfLines={1}>{item.business_name}</Text>
          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{item.owner_name}</Text>
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>{item.email || "No email"} · {item.phone || "No phone"}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Call vendor"
          accessibilityState={{ disabled: !hasPhone }}
          className="min-w-11 min-h-11 items-center justify-center"
          style={{ opacity: hasPhone ? 1 : 0.4 }}
          onPress={callVendor}
        >
          <Phone size={18} color="#16A34A" />
        </Pressable>
        <Pressable
          accessibilityLabel="Message vendor on WhatsApp"
          accessibilityState={{ disabled: !hasPhone }}
          className="min-w-11 min-h-11 items-center justify-center"
          style={{ opacity: hasPhone ? 1 : 0.4 }}
          onPress={whatsAppVendor}
        >
          <MessageCircle size={18} color="#25D366" />
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
        <View className="flex-row items-center">
          <CategoryBadge
            name={item.category_name || "Uncategorized"}
            style={{ color: "#787178", fontSize: typeScale.bodyCompact }}
          />
          <Text className="text-muted-foreground text-xs" numberOfLines={1}>
            {" "}· {item.city}, {item.state}
          </Text>
        </View>
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
          <Text className="text-muted-foreground text-metadata">Profile {health.completeness}% · {health.healthLabel}</Text>
          {health.missing.length ? <Text className="text-amber-500 text-metadata" numberOfLines={1}>Missing: {health.missing.slice(0, 2).join(", ")}</Text> : null}
        </View>
        <View className="h-1.5 rounded-full bg-muted overflow-hidden mt-1"><View className={`h-full rounded-full ${health.completeness >= 80 ? "bg-emerald-500" : health.completeness >= 50 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${health.completeness}%` }} /></View>
      </View> : null}
      <View className="border-t border-border mt-3 pt-3 flex-row justify-between">
        <Text className="text-muted-foreground text-metadata">Registered {new Date(item.registered_at).toLocaleDateString()}</Text>
        <Text className="text-muted-foreground text-metadata">Updated {new Date(item.updated_at).toLocaleDateString()}</Text>
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
  return <View className={`px-2 py-1 rounded-full ${colors[tone]}`}><Text className={`text-metadata font-semibold capitalize ${colors[tone].split(" ")[1]}`}>{text}</Text></View>;
}
