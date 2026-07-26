import React from "react";
import {
  Bell,
  BadgeCheck,
  CalendarCheck,
  CalendarX,
  Megaphone,
  Percent,
  UserRoundCheck,
  WalletCards,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AuthBackButton } from "@/components/auth/AuthBackButton";
import { useAppTheme } from "@/components/ThemeProvider";
import {
  type NotificationType,
  type RoyalLagnNotification,
  useNotifications,
} from "@/context/NotificationContext";

const notificationIcons: Record<NotificationType, React.ElementType> = {
  vendor_approval: BadgeCheck,
  booking_confirmed: CalendarCheck,
  booking_cancelled: CalendarX,
  new_offer: Percent,
  admin_announcement: Megaphone,
  profile_updated: UserRoundCheck,
  payment_reminder: WalletCards,
};

const formatTimestamp = (timestamp: string) => {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return "";
  return value.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

function NotificationRow({
  notification,
  dark,
  onOpen,
}: {
  notification: RoyalLagnNotification;
  dark: boolean;
  onOpen: () => void;
}) {
  const Icon = notificationIcons[notification.type];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${notification.title}${notification.read ? "" : ", unread"}`}
      onPress={onOpen}
      style={({ pressed }) => [
        styles.notification,
        {
          backgroundColor: notification.read
            ? dark ? "#1E1E1E" : "#FFFFFF"
            : dark ? "#2A2025" : "#FFF7FA",
          borderColor: dark ? "#333333" : "#F0D9E4",
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.notificationIcon, { backgroundColor: dark ? "#351D28" : "#FFF1F6" }]}>
        <Icon size={20} color="#E91E63" strokeWidth={1.8} />
      </View>
      <View style={styles.notificationCopy}>
        <View style={styles.titleRow}>
          <Text className="text-foreground text-sm font-bold" style={styles.notificationTitle}>
            {notification.title}
          </Text>
          {!notification.read ? <View style={styles.unreadDot} /> : null}
        </View>
        <Text className="text-muted-foreground text-xs leading-5">
          {notification.message}
        </Text>
        <Text className="text-muted-foreground text-[10px] mt-2">
          {formatTimestamp(notification.timestamp)}
        </Text>
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications,
  } = useNotifications();

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      edges={["top", "left", "right"]}
    >
      <View style={[styles.header, { borderBottomColor: isDark ? "#333333" : "#F0D9E4" }]}>
        <AuthBackButton fallbackRoute="/(tabs)" />
        <Text className="text-foreground text-xl font-bold">Notifications</Text>
      </View>

      {!notifications.length ? (
        <View style={styles.empty}>
          <View
            style={[
              styles.iconWrap,
              {
                backgroundColor: isDark ? "#351D28" : "#FFF1F6",
                borderColor: isDark ? "#5B2940" : "#F7C7D9",
              },
            ]}
          >
            <Bell size={34} color="#E91E63" strokeWidth={1.7} />
            <View style={styles.sparkle} />
          </View>
          <Text className="text-foreground text-xl font-bold text-center">
            No notifications yet
          </Text>
          <Text className="text-muted-foreground text-sm leading-5 text-center mt-2">
            Vendor approvals, booking updates, offers and announcements will appear here.
          </Text>
        </View>
      ) : (
        <>
          <View style={[styles.actions, { borderBottomColor: isDark ? "#333333" : "#F0D9E4" }]}>
            <Pressable
              accessibilityRole="button"
              onPress={markAllAsRead}
              disabled={unreadCount === 0}
              style={({ pressed }) => [
                styles.action,
                unreadCount === 0 && styles.actionDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text className="text-primary text-xs font-bold">Mark all as read</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={clearNotifications}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <Text className="text-primary text-xs font-bold">Clear all</Text>
            </Pressable>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.list}
          >
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                dark={isDark}
                onOpen={() => markAsRead(notification.id)}
              />
            ))}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: 60,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  empty: {
    flex: 1,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingBottom: 60,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  sparkle: {
    position: "absolute",
    top: 18,
    right: 18,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E91E63",
  },
  actions: {
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  action: {
    minHeight: 36,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionDisabled: {
    opacity: 0.4,
  },
  list: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 16,
    paddingBottom: 40,
    gap: 10,
  },
  notification: {
    minHeight: 104,
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  notificationIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  notificationCopy: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 3,
  },
  notificationTitle: {
    flex: 1,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#E91E63",
  },
  pressed: {
    opacity: 0.72,
  },
});
