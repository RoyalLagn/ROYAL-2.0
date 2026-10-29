import React from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  ArrowRight,
  Calendar,
  ChevronRight,
  PhoneCall,
  UserCheck,
} from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";

export interface ScheduleItem {
  id: string;
  time: string;
  title: string;
  category: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}

export default function VendorCrmScheduleCard() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";

  const schedule: ScheduleItem[] = [
    {
      id: "1",
      time: "10:00 AM",
      title: "Client Meeting",
      category: "Wedding Photography (Pune)",
      icon: Calendar,
    },
    {
      id: "2",
      time: "12:00 PM",
      title: "Enquiry Call",
      category: "Event Decoration",
      icon: PhoneCall,
    },
    {
      id: "3",
      time: "03:00 PM",
      title: "Site Visit",
      category: "Venue Inspection",
      icon: UserCheck,
    },
  ];

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, isDark && styles.textDark]}>
          Today&apos;s Schedule
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/VendorCalendar")}
          style={({ pressed }) => [styles.viewAllBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.viewAllText}>View All</Text>
          <ArrowRight size={13} color="#E91E63" strokeWidth={2.4} />
        </Pressable>
      </View>

      {/* Schedule Items List */}
      <View style={styles.list}>
        {schedule.map((item) => {
          const Icon = item.icon;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`${item.time}: ${item.title}`}
              onPress={() => router.push("/VendorCalendar")}
              style={({ pressed, hovered }: any) => [
                styles.itemRow,
                isDark && styles.itemRowDark,
                hovered && styles.itemRowHovered,
                pressed && { opacity: 0.8 },
              ]}
            >
              {/* Time */}
              <Text style={[styles.timeText, isDark && styles.textDark]}>
                {item.time}
              </Text>

              {/* Icon badge */}
              <View style={styles.iconCircle}>
                <Icon size={14} color="#E91E63" strokeWidth={2.2} />
              </View>

              {/* Content */}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[styles.itemTitle, isDark && styles.textDark]}>
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={styles.itemCategory}>
                  {item.category}
                </Text>
              </View>

              <ChevronRight size={15} color="#9CA3AF" />
            </Pressable>
          );
        })}
      </View>
    </View>
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
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box" as any,
  },
  cardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
  },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#E91E63",
  },
  list: {
    gap: 8,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#FAFAFA",
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  itemRowDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
  },
  itemRowHovered: {
    borderColor: "#FCE7F3",
  },
  timeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#374151",
    width: 58,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FDF2F8",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  itemTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
  },
  itemCategory: {
    fontSize: 10.5,
    color: "#6B7280",
    marginTop: 1,
  },
  textDark: {
    color: "#F9FAFB",
  },
});
