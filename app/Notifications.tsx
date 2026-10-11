import React, { useCallback, useRef, useState } from "react";
import {
  Bell,
  BadgeCheck,
  CalendarCheck,
  CalendarX,
  Megaphone,
  Percent,
  Trash2,
  UserRoundCheck,
  WalletCards,
  X,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { AuthBackButton } from "@/components/auth/AuthBackButton";
import { useAppTheme } from "@/components/ThemeProvider";
import {
  type NotificationType,
  type RoyalLagnNotification,
  useNotifications,
} from "@/context/NotificationContext";
import { SkeletonList } from "@/components/loading/Skeleton";
import PageLoader from "@/components/loading/PageLoader";
import { safeInternalTarget } from "@/utils/safeNavigation";

const PUBLIC_NOTIFICATION_ROUTES = new Set([
  "/(tabs)",
  "/(tabs)/Categories",
  "/(tabs)/enquiry",
  "/(tabs)/favorites",
  "/(tabs)/profile",
  "/DashboardCenter",
  "/Help",
  "/NearbyVendors",
  "/Notifications",
  "/PrivacyPolicy",
  "/Search",
  "/Terms",
  "/VendorsListing",
  "/VendorsProfile",
]);

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

const notificationDestination = (notification: RoyalLagnNotification) => {
  if (notification.targetPath) return notification.targetPath;
  if (
    notification.type === "booking_confirmed" ||
    notification.type === "booking_cancelled" ||
    notification.type === "payment_reminder"
  ) {
    return "/(tabs)/enquiry";
  }
  if (notification.type === "new_offer") return "/(tabs)/Categories";
  if (notification.type === "profile_updated") return "/(tabs)/profile";
  if (notification.type === "vendor_approval") return "/DashboardCenter";
  return null;
};

function openDestination(router: ReturnType<typeof useRouter>, path: string) {
  const target = safeInternalTarget(path, PUBLIC_NOTIFICATION_ROUTES);
  if (!target) return;
  router.push((target.params ? target : target.pathname) as never);
}

function NotificationRow({
  notification,
  dark,
  onOpen,
  onDelete,
}: {
  notification: RoyalLagnNotification;
  dark: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const Icon = notificationIcons[notification.type];
  return (
    <View
      style={[
        styles.notification,
        {
          backgroundColor: notification.read
            ? dark
              ? "#1E1E1E"
              : "#FFFFFF"
            : dark
              ? "#241D21"
              : "#FFFCFD",
          borderColor: dark ? "#A94369" : "#F3A4C0",
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${notification.title}${notification.read ? "" : ", unread"}`}
        onPress={onOpen}
        style={({ pressed }) => [styles.notificationMain, pressed && styles.pressed]}
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
          <Text numberOfLines={2} className="text-muted-foreground text-xs leading-5">
            {notification.message}
          </Text>
          <Text className="text-muted-foreground text-metadata mt-2">
            {formatTimestamp(notification.timestamp)}
          </Text>
        </View>
      </Pressable>
      <View style={styles.deleteSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete ${notification.title}`}
          hitSlop={8}
          onPress={onDelete}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
        >
          <Trash2 size={16} color={dark ? "#A3A3A3" : "#9CA3AF"} strokeWidth={1.8} />
        </Pressable>
      </View>
    </View>
  );
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearNotifications,
    refreshNotifications,
  } = useNotifications();
  const markedOnFocus = useRef(false);
  const [selected, setSelected] = useState<RoyalLagnNotification | null>(null);

  useFocusEffect(
    useCallback(() => {
      markedOnFocus.current = false;
      if (!loading && unreadCount > 0) {
        markedOnFocus.current = true;
        void markAllAsRead();
      }
      return () => {
        markedOnFocus.current = false;
      };
    }, [loading, markAllAsRead, unreadCount]),
  );

  const confirmClearAll = () => {
    Alert.alert(
      "Clear all notifications?",
      "This removes notifications from your inbox only. Admin history is not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear all",
          style: "destructive",
          onPress: () => {
            void clearNotifications().then((success) => {
              if (!success) {
                Alert.alert("Could not clear", "Please check your connection and try again.");
              }
            });
          },
        },
      ],
    );
  };

  const confirmDelete = (notification: RoyalLagnNotification) => {
    Alert.alert("Delete notification?", "This removes it from your inbox only.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteNotification(notification.id).then((success) => {
            if (!success) {
              Alert.alert("Could not delete", "Please check your connection and try again.");
            }
          });
        },
      },
    ]);
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={["top", "left", "right"]}>
      {loading ? <PageLoader /> : null}
      <View style={[styles.header, { borderBottomColor: isDark ? "#333333" : "#F0D9E4" }]}>
        <AuthBackButton fallbackRoute="/(tabs)" />
        <Text className="text-foreground text-xl font-bold">Notifications</Text>
      </View>

      {error ? (
        <View style={[styles.errorBanner, { borderBottomColor: isDark ? "#333333" : "#F0D9E4" }]}>
          <Text className="text-muted-foreground text-xs flex-1">{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void refreshNotifications()}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            <Text className="text-primary text-xs font-bold">Retry</Text>
          </Pressable>
        </View>
      ) : null}

      {loading ? (
        <View style={{ padding: 16 }}>
          <SkeletonList count={6} height={76} />
        </View>
      ) : !notifications.length ? (
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
              onPress={() => void markAllAsRead()}
              disabled={unreadCount === 0}
              style={({ pressed }) => [
                styles.action,
                unreadCount === 0 && styles.actionDisabled,
                pressed && styles.pressed,
              ]}
            >
              <Text
                className="text-xs font-bold"
                style={{ color: unreadCount === 0 ? (isDark ? "#6B6267" : "#C7B8BE") : "#E91E63" }}
              >
                Mark all as read
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={confirmClearAll}
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
                onOpen={() => {
                  void markAsRead(notification.id);
                  setSelected(notification);
                }}
                onDelete={() => confirmDelete(notification)}
              />
            ))}
          </ScrollView>
        </>
      )}
      <Modal visible={Boolean(selected)} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.modalBackdrop}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close notification" style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} />
          <View accessibilityRole="alert" style={[styles.modalCard, { backgroundColor: isDark ? "#1E1E1E" : "#FFFFFF", borderColor: isDark ? "#A94369" : "#F3A4C0" }]}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIcon, { backgroundColor: isDark ? "#351D28" : "#FFF1F6" }]}>{selected ? React.createElement(notificationIcons[selected.type], { size: 22, color: "#E91E63", strokeWidth: 1.8 }) : null}</View>
              <View style={styles.notificationCopy}><Text className="text-foreground text-lg font-bold">{selected?.title}</Text><Text className="text-muted-foreground text-xs mt-1">{selected ? formatTimestamp(selected.timestamp) : ""}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close notification details" onPress={() => setSelected(null)} style={({ pressed }) => [styles.modalClose, { backgroundColor: isDark ? "#351D28" : "#FFF1F6" }, pressed && styles.pressed]}><X size={20} color={isDark ? "#F7F2F4" : "#171118"} /></Pressable>
            </View>
            <Text className="text-foreground text-sm leading-6" style={styles.modalMessage}>{selected?.message}</Text>
            <View style={styles.modalActions}>
              <Pressable accessibilityRole="button" onPress={() => setSelected(null)} style={({ pressed }) => [styles.modalButton, { borderColor: isDark ? "#A94369" : "#F3A4C0" }, pressed && styles.pressed]}><Text className="text-foreground text-xs font-bold">Close</Text></Pressable>
              {selected && notificationDestination(selected) ? <Pressable accessibilityRole="button" onPress={() => { const destination = notificationDestination(selected); setSelected(null); if (destination) openDestination(router, destination); }} style={({ pressed }) => [styles.modalPrimary, pressed && styles.pressed]}><Text className="text-white text-xs font-bold">Open related page</Text></Pressable> : null}
            </View>
          </View>
        </View>
      </Modal>
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
  errorBanner: {
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    position: "relative",
  },
  notificationMain: {
    width: "100%",
    paddingRight: 42,
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
  deleteSlot: {
    position: "absolute",
    top: 14,
    right: 7,
    width: 32,
    height: 32,
    zIndex: 1,
  },
  deleteButton: {
    width: "100%",
    height: "100%",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.72,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,8,12,.58)",
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  modalCard: {
    width: "100%",
    maxWidth: 460,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#2A0D18",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 8,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  modalIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  modalClose: { width: Platform.OS === "android" ? 48 : 42, height: Platform.OS === "android" ? 48 : 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  modalMessage: { marginTop: 18 },
  modalActions: { marginTop: 22, flexDirection: "row", gap: 10 },
  modalButton: { minHeight: Platform.OS === "android" ? 48 : 44, flex: 1, borderWidth: 1, borderRadius: 13, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  modalPrimary: { minHeight: Platform.OS === "android" ? 48 : 44, flex: 1.4, borderRadius: 13, backgroundColor: "#E91E63", alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
});
