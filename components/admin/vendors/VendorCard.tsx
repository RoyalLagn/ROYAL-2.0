import React from "react";
import CategoryBadge from "@/components/categories/CategoryBadge";
import { Alert, Image, Linking, Pressable, Text, View } from "react-native";
import { MessageCircle, MoreVertical, Phone, UserCheck, UserX } from "lucide-react-native";
import type { AdminVendorRecord, VendorHealthMetrics } from "@/types/adminVendors";
import { ResponsiveCard } from "@/components/responsive/ResponsiveCard";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";
import { KPIChip } from "@/components/admin/ui/KPIChip";
import { normalizeWhatsAppPhone } from "@/services/contactActions";
import { typeScale } from "@/constants/typography";

const PHONE_UNAVAILABLE_MESSAGE = "Phone number not available.";

export const VendorCard = React.memo(function VendorCard({
  item,
  onView,
  onActions,
  onApprove,
  onReject,
  health,
}: {
  item: AdminVendorRecord;
  onView: () => void;
  onActions: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  health?: VendorHealthMetrics;
}) {
  const { isPhone } = useResponsiveLayout();
  const hasPhone = Boolean(item.phone);
  const awaitingReview = !item.vendor_id;
  const callVendor = () => {
    if (!item.phone) { Alert.alert(PHONE_UNAVAILABLE_MESSAGE); return; }
    void Linking.openURL(`tel:${item.phone}`);
  };
  const whatsAppVendor = () => {
    if (!item.phone) { Alert.alert(PHONE_UNAVAILABLE_MESSAGE); return; }
    void Linking.openURL(`https://wa.me/${normalizeWhatsAppPhone(item.phone)}`);
  };
  return (
    <ResponsiveCard className={`${awaitingReview ? "bg-amber-500/5" : "bg-card"} hover:border-primary/35 hover:bg-primary/5 transition-colors duration-200`} style={{ borderRadius: 16 }}>
      <View className="flex-row items-start">
        {item.logo_url
          ? <Image source={{ uri: item.logo_url }} className="w-16 h-16 rounded-xl bg-white border border-border" resizeMode="contain" />
          : <View className="w-16 h-16 rounded-xl bg-primary/10 items-center justify-center"><Text className="text-primary font-bold">{item.business_name.slice(0, 2).toUpperCase()}</Text></View>}
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${item.business_name}`} className="flex-1 min-w-0 ml-3 rounded-lg active:opacity-75" onPress={onView}>
          <Text className="text-foreground text-card-title font-bold" numberOfLines={1}>{item.business_name}</Text>
          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{item.owner_name}</Text>
          <Text className="text-muted-foreground text-xs mt-1" numberOfLines={1}>{item.email || "No email"} · {item.phone || "No phone"}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Call vendor"
          accessibilityState={{ disabled: !hasPhone }}
          className="min-w-11 min-h-11 rounded-xl border border-border bg-background items-center justify-center hover:bg-emerald-500/5 active:opacity-80 transition-colors duration-200"
          style={({ pressed }) => ({ opacity: hasPhone ? 1 : 0.4, transform: [{ scale: pressed ? 0.97 : 1 }] })}
          onPress={callVendor}
        >
          <Phone size={18} color="#16A34A" />
        </Pressable>
        <Pressable
          accessibilityLabel="Message vendor on WhatsApp"
          accessibilityState={{ disabled: !hasPhone }}
          className="min-w-11 min-h-11 rounded-xl border border-border bg-background items-center justify-center ml-2 hover:bg-emerald-500/5 active:opacity-80 transition-colors duration-200"
          style={({ pressed }) => ({ opacity: hasPhone ? 1 : 0.4, transform: [{ scale: pressed ? 0.97 : 1 }] })}
          onPress={whatsAppVendor}
        >
          <MessageCircle size={18} color="#25D366" />
        </Pressable>
        {awaitingReview ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open actions for ${item.business_name}`} className="min-w-11 min-h-11 rounded-xl border border-border bg-background items-center justify-center ml-2 hover:bg-muted active:bg-muted transition-colors duration-200" style={({ pressed }) => pressed ? { transform: [{ scale: 0.97 }] } : undefined} onPress={onActions}>
            <MoreVertical size={20} className="text-muted-foreground" />
          </Pressable>
        )}
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
      {awaitingReview ? (
        <View className="flex-row gap-2 mt-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Approve ${item.business_name}`}
            accessibilityHint="Publishes this vendor's profile and notifies them of approval"
            className="flex-1 min-h-12 rounded-2xl bg-emerald-600 flex-row items-center justify-center gap-2"
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }], opacity: pressed ? 0.92 : 1 })}
            onPress={onApprove}
          >
            <UserCheck size={18} color="#FFFFFF" />
            <Text className="text-white font-bold">Approve</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Reject ${item.business_name}`}
            accessibilityHint="Notifies this vendor that their application was not approved"
            className="flex-1 min-h-12 rounded-2xl border border-red-200 bg-red-50 flex-row items-center justify-center gap-2"
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }], opacity: pressed ? 0.85 : 1 })}
            onPress={onReject}
          >
            <UserX size={18} color="#DC2626" />
            <Text className="text-red-600 font-bold">Reject</Text>
          </Pressable>
        </View>
      ) : null}
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
