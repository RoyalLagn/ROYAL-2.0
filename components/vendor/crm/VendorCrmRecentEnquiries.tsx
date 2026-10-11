import React from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowRight, ChevronRight } from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";

export interface EnquiryItem {
  id: string;
  name: string;
  category: string;
  timeAgo: string;
  status: "New" | "Pending" | "Replied" | "Converted";
  initials: string;
  avatarBg: string;
  statusBg: string;
  statusColor: string;
}

export default function VendorCrmRecentEnquiries() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";

  const enquiries: EnquiryItem[] = [
    {
      id: "1",
      name: "Rohan Patil",
      category: "Wedding Photography",
      timeAgo: "2 hours ago",
      status: "New",
      initials: "RP",
      avatarBg: "#FFE4E6",
      statusBg: "#FDF2F8",
      statusColor: "#E91E63",
    },
    {
      id: "2",
      name: "Sneha Kulkarni",
      category: "Pre-wedding Shoot",
      timeAgo: "5 hours ago",
      status: "Pending",
      initials: "SK",
      avatarBg: "#FEF3C7",
      statusBg: "#FFFBEB",
      statusColor: "#D97706",
    },
    {
      id: "3",
      name: "Amit More",
      category: "Event Photography",
      timeAgo: "1 day ago",
      status: "Replied",
      initials: "AM",
      avatarBg: "#DCFCE7",
      statusBg: "#ECFDF5",
      statusColor: "#059669",
    },
  ];

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, isDark && styles.textDark]}>
          Recent Enquiries
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/VendorEnquiries")}
          style={({ pressed }) => [styles.viewAllBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.viewAllText}>View All</Text>
          <ArrowRight size={13} color="#E91E63" strokeWidth={2.4} />
        </Pressable>
      </View>

      {/* List */}
      <View style={styles.list}>
        {enquiries.map((item) => (
          <Pressable
            key={item.id}
            accessibilityRole="button"
            accessibilityLabel={`${item.name} (${item.status})`}
            onPress={() => router.push("/VendorEnquiries")}
            style={({ pressed, hovered }: any) => [
              styles.itemRow,
              isDark && styles.itemRowDark,
              hovered && styles.itemRowHovered,
              pressed && { opacity: 0.8 },
            ]}
          >
            {/* Avatar Initials Circle */}
            <View style={[styles.avatarCircle, { backgroundColor: item.avatarBg }]}>
              <Text style={styles.avatarText}>{item.initials}</Text>
            </View>

            {/* Content */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[styles.name, isDark && styles.textDark]}>
                {item.name}
              </Text>
              <Text numberOfLines={1} style={styles.category}>
                {item.category}
              </Text>
            </View>

            {/* Time and Status Badge */}
            <View style={styles.rightWrap}>
              <Text style={styles.timeText}>{item.timeAgo}</Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: item.statusBg, borderColor: item.statusColor },
                ]}
              >
                <Text style={[styles.statusText, { color: item.statusColor }]}>
                  {item.status}
                </Text>
              </View>
            </View>

            <ChevronRight size={15} color="#9CA3AF" />
          </Pressable>
        ))}
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
    minHeight: 210,
    justifyContent: "space-between",
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
    paddingVertical: 7,
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
  avatarCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 11.5,
    fontWeight: "800",
    color: "#374151",
  },
  name: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#111827",
  },
  category: {
    fontSize: 10.5,
    color: "#6B7280",
    marginTop: 1,
  },
  rightWrap: {
    alignItems: "flex-end",
    gap: 3,
  },
  timeText: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 9.5,
    fontWeight: "800",
  },
  textDark: {
    color: "#F9FAFB",
  },
});
