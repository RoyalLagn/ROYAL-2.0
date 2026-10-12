import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Calendar,
  CalendarCheck,
  Image as ImageIcon,
  Megaphone,
} from "lucide-react-native";
import AnimatedPressable from "@/components/animated/AnimatedPressable";
import { useAppTheme } from "@/components/ThemeProvider";

export interface QuickActionItem {
  id: string;
  label: string;
  route: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  iconBg: string;
  iconColor: string;
  tileBg: string;
}

export default function VendorCrmQuickActions() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";

  const actions: QuickActionItem[] = [
    {
      id: "portfolio",
      label: "Add Portfolio",
      route: "/VendorGallery",
      icon: ImageIcon,
      iconBg: "#FFE4E6",
      iconColor: "#E11D48",
      tileBg: "#FFF1F2",
    },
    {
      id: "bookings",
      label: "Manage Bookings",
      route: "/VendorBookings",
      icon: CalendarCheck,
      iconBg: "#DBEAFE",
      iconColor: "#2563EB",
      tileBg: "#EFF6FF",
    },
    {
      id: "calendar",
      label: "Calendar & Availability",
      route: "/VendorCalendar",
      icon: Calendar,
      iconBg: "#DCFCE7",
      iconColor: "#16A34A",
      tileBg: "#F0FDF4",
    },
    {
      id: "marketing",
      label: "Marketing Tools",
      route: "/vendor-marketing-center",
      icon: Megaphone,
      iconBg: "#F3E8FF",
      iconColor: "#9333EA",
      tileBg: "#FAF5FF",
    },
  ];

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <Text style={[styles.title, isDark && styles.textDark]}>
        Quick Actions
      </Text>

      <View style={styles.grid}>
        {actions.map((act) => (
          <ActionTile key={act.id} action={act} isDark={isDark} onPress={() => router.push(act.route as any)} />
        ))}
      </View>
    </View>
  );
}

function ActionTile({
  action,
  isDark,
  onPress,
}: {
  action: QuickActionItem;
  isDark: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const Icon = action.icon;
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={action.label}
      onPress={onPress}
      pressScale={0.97}
      hoverTranslateY={-2}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.tile,
        { backgroundColor: isDark ? "#111827" : action.tileBg },
        isDark && styles.tileDark,
        hovered && styles.tileHovered,
      ]}
    >
      <View style={[styles.iconBox, { backgroundColor: action.iconBg }]}>
        <Icon size={16} color={action.iconColor} strokeWidth={2.2} />
      </View>
      <Text numberOfLines={1} style={[styles.tileLabel, isDark && styles.textDark]}>
        {action.label}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FCE7F3",
    padding: 18,
    flex: 1,
    minHeight: 210,
    justifyContent: "space-between",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    boxSizing: "border-box" as any,
  },
  cardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
    width: "100%",
  },
  tile: {
    width: "48%",
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "transparent",
  },
  tileDark: {
    borderColor: "#374151",
  },
  tileHovered: {
    borderColor: "#E91E63",
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1F2937",
    flex: 1,
    minWidth: 0,
  },
  textDark: {
    color: "#F9FAFB",
  },
});
