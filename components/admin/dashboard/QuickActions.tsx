import React from "react";
import { Pressable, Text } from "react-native";
import { Href, useRouter } from "expo-router";
import { Building2, ClipboardList, FileBarChart, Folder, Settings, Users } from "lucide-react-native";
import { ResponsiveGrid } from "@/components/responsive/ResponsiveGrid";
import { ResponsiveCard } from "@/components/responsive/ResponsiveCard";
import { useResponsiveLayout } from "@/context/ResponsiveLayoutContext";

const actions = [
  ["Review Vendor Applications", "Approve or reject pending businesses", ClipboardList, "/VendorApplications"],
  ["View Vendors", "Open the current vendor directory", Building2, "/vendors-admin-listing"],
  ["View Public Users", "See registered customer accounts", Users, "/AdminUsers"],
  ["View Categories", "Open marketplace categories", Folder, "/AdminCategories"],
  ["Open Reports", "Go to the reports workspace", FileBarChart, "/AdminReports"],
  ["Open Settings", "Manage administrator settings", Settings, "/AdminSettings"],
] as const;

export function QuickActions() {
  const router = useRouter();
  const responsive = useResponsiveLayout();
  return (
    <ResponsiveGrid columns={responsive.isPhone ? (responsive.breakpoint === "xs" ? 1 : 2) : 3} gap={responsive.isPhone ? 10 : 12}>
      {actions.map(([title, description, Icon, route]) => (
        <Pressable key={title} className="min-h-11" onPress={() => router.push(route as Href)} accessibilityRole="button">
          <ResponsiveCard className="items-center" style={responsive.isPhone ? { padding: 12 } : undefined}>
          <Icon size={responsive.iconSize} className="text-primary" />
          <Text className="text-foreground text-xs text-center mt-2" numberOfLines={2}>{title}</Text>
          <Text className="text-muted-foreground text-[10px] text-center mt-1" numberOfLines={2}>{description}</Text>
          </ResponsiveCard>
        </Pressable>
      ))}
    </ResponsiveGrid>
  );
}
