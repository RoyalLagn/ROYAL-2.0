import React from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowRight, Calendar, ChevronRight, Crown } from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";

export interface VendorCrmPlanCardProps {
  planName?: string;
  accessStatus?: string;
  onPress?: () => void;
}

export default function VendorCrmPlanCard({
  planName = "Free",
  accessStatus = "Access: Ongoing",
  onPress,
}: VendorCrmPlanCardProps) {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push("/VendorSubscription");
    }
  };

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Your Plan: ${planName}`}
        onPress={handlePress}
        style={({ pressed }) => [styles.topRow, pressed && { opacity: 0.8 }]}
      >
        {/* Crown Icon Box */}
        <View style={styles.crownBox}>
          <Crown size={22} color="#FFFFFF" strokeWidth={2.2} />
        </View>

        {/* Plan Information */}
        <View style={styles.planInfo}>
          <Text style={[styles.planLabel, isDark && styles.textMutedDark]}>
            Your Plan
          </Text>
          <Text style={[styles.planName, isDark && styles.textDark]}>
            {planName}
          </Text>
          <View style={styles.accessRow}>
            <Calendar size={12} color="#9CA3AF" />
            <Text style={styles.accessText}>{accessStatus}</Text>
          </View>
        </View>

        {/* Right Chevron */}
        <ChevronRight size={18} color="#9CA3AF" />
      </Pressable>

      {/* View Plan Details Link */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View plan details"
        onPress={handlePress}
        style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.linkText}>View Plan Details</Text>
        <ArrowRight size={14} color="#E91E63" strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#FCE7F3",
    padding: 20,
    justifyContent: "space-between",
  },
  cardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  crownBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "#E91E63",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#E91E63",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  planInfo: {
    flex: 1,
  },
  planLabel: {
    fontSize: 11.5,
    color: "#6B7280",
    fontWeight: "600",
  },
  planName: {
    fontSize: 20,
    fontWeight: "900",
    color: "#111827",
    marginVertical: 1,
  },
  accessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  accessText: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "500",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#FDF2F8",
  },
  linkText: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#E91E63",
  },
  textDark: {
    color: "#F9FAFB",
  },
  textMutedDark: {
    color: "#9CA3AF",
  },
});
