import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Bell, CheckCheck, MailX, Trash2 } from "lucide-react-native";
import { useRouter } from "expo-router";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorNotifications, type VendorNotification } from "@/context/VendorNotificationContext";
import { SkeletonList } from "@/components/loading/Skeleton";
import AnimatedPressable from "@/components/animated/AnimatedPressable";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import { vendorWorkspaceRoutes } from "@/vendor/navigation";
import { safeInternalTarget } from "@/utils/safeNavigation";

const VENDOR_NOTIFICATION_ROUTES = new Set(vendorWorkspaceRoutes);

const vendorNotificationDestination = (notification: VendorNotification) => {
  if (notification.target_path) return notification.target_path;
  if (notification.kind === "subscription" || notification.kind === "payment") {
    return "/VendorSubscription";
  }
  if (notification.kind === "enquiry") return "/VendorEnquiries";
  if (notification.kind === "review") return "/vendor-dashboard";
  if (notification.kind === "admin") return "/vendor-dashboard";
  return null;
};

function openDestination(router: ReturnType<typeof useRouter>, path: string) {
  const target = safeInternalTarget(path, VENDOR_NOTIFICATION_ROUTES);
  if (!target) return;
  router.push((target.params ? target : target.pathname) as never);
}

export default function VendorNotifications() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const {
    notifications,
    unreadCount: unread,
    loading,
    error,
    refresh,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearNotifications,
    clearReadNotifications,
  } = useVendorNotifications();
  const readCount = notifications.length - unread;

  const openNotification = (notification: VendorNotification) => {
    if (!notification.is_read) {
      void markAsRead(notification.id).then((success) => {
        if (!success) {
          Alert.alert("Notification not updated", "Please check your connection and try again.");
        }
      });
    }
    const destination = vendorNotificationDestination(notification);
    if (destination) openDestination(router, destination);
  };

  const readAll = () => {
    void markAllAsRead().then((success) => {
      if (!success) {
        Alert.alert("Notifications not updated", "Please check your connection and try again.");
      }
    });
  };

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

  const confirmClearRead = () => {
    Alert.alert(
      "Clear read notifications?",
      "This removes notifications you've already read from your inbox. Unread notifications stay.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear read",
          style: "destructive",
          onPress: () => {
            void clearReadNotifications().then((success) => {
              if (!success) {
                Alert.alert("Could not clear", "Please check your connection and try again.");
              }
            });
          },
        },
      ],
    );
  };

  const confirmDelete = (notification: VendorNotification) => {
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
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <VendorHeader />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heading}>
          <View style={styles.flex}>
            <Text style={[styles.eyebrow, { color: colors.pink }]}>STAY INFORMED</Text>
            <Text style={[styles.title, { color: colors.text }]}>Notifications</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {unread ? `${unread} unread updates` : "You are all caught up."}
            </Text>
          </View>
          <View style={styles.headingActions}>
            {unread > 0 ? (
              <Pressable
                onPress={readAll}
                style={[styles.mark, { backgroundColor: colors.surfaceSoft }]}
              >
                <CheckCheck size={16} color={colors.pink} />
                <Text style={{ color: colors.pink, fontSize: typeScale.caption, fontWeight: "700" }}>
                  Read all
                </Text>
              </Pressable>
            ) : null}
            {readCount > 0 ? (
              <Pressable
                onPress={confirmClearRead}
                style={[styles.mark, { backgroundColor: colors.surfaceSoft }]}
              >
                <MailX size={14} color={colors.pink} />
                <Text style={{ color: colors.pink, fontSize: typeScale.caption, fontWeight: "700" }}>
                  Clear read
                </Text>
              </Pressable>
            ) : null}
            {notifications.length > 0 ? (
              <Pressable
                onPress={confirmClearAll}
                style={[styles.mark, { backgroundColor: colors.surfaceSoft }]}
              >
                <Trash2 size={14} color={colors.pink} />
                <Text style={{ color: colors.pink, fontSize: typeScale.caption, fontWeight: "700" }}>
                  Clear all
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.errorText, { color: colors.muted }]}>{error}</Text>
            <Pressable onPress={() => void refresh()}>
              <Text style={{ color: colors.pink, fontSize: typeScale.metadata, fontWeight: "700" }}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <SkeletonList count={5} height={78} />
        ) : (
          notifications.map((item) => (
            <View
              key={item.id}
              style={[
                styles.card,
                {
                  backgroundColor: colors.surface,
                  borderColor: item.is_read ? colors.border : colors.pink,
                },
              ]}
            >
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={`${item.title}${item.is_read ? "" : ", unread"}`}
                onPress={() => openNotification(item)}
                style={styles.cardMain}
              >
                <View style={[styles.icon, { backgroundColor: colors.surfaceSoft }]}>
                  <Bell size={18} color={item.is_read ? colors.muted : colors.pink} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.body, { color: colors.muted }]}>
                    {item.body || "Open to mark this notification as read."}
                  </Text>
                  <Text style={[styles.date, { color: colors.muted }]}>
                    {new Date(item.created_at).toLocaleString()}
                  </Text>
                </View>
                {!item.is_read ? (
                  <View style={[styles.dot, { backgroundColor: colors.pink }]} />
                ) : null}
              </AnimatedPressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.title}`}
                hitSlop={8}
                onPress={() => confirmDelete(item)}
                style={styles.deleteButton}
              >
                <Trash2 size={15} color={colors.muted} />
              </Pressable>
            </View>
          ))
        )}

        {!loading && !notifications.length ? (
          <View
            style={[
              styles.empty,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Bell size={29} color={colors.muted} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications</Text>
            <Text style={[styles.emptyBody, { color: colors.muted }]}>
              Enquiries, reviews and important account updates will appear here.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    padding: 16,
    paddingTop: 22,
    paddingBottom: 24,
  },
  heading: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 20,
  },
  headingActions: { gap: 8, alignItems: "flex-end" },
  flex: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: typeScale.caption, letterSpacing: 1.5, fontWeight: "700", marginBottom: 5 },
  title: { ...typeStyles.pageTitle },
  subtitle: { ...typeStyles.bodyCompact, marginTop: 4 },
  mark: {
    height: 39,
    borderRadius: 13,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  errorBanner: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  errorText: { flex: 1, fontSize: typeScale.metadata, lineHeight: typeLeading.metadata },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
  },
  icon: {
    width: 39,
    height: 39,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: typeScale.bodyCompact, fontWeight: "700" },
  body: { fontSize: typeScale.metadata, lineHeight: typeLeading.metadata, marginTop: 4 },
  date: { fontSize: typeScale.caption, marginTop: 7 },
  dot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  deleteButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  empty: { borderWidth: 1, borderRadius: 23, alignItems: "center", padding: 32 },
  emptyTitle: { fontSize: typeScale.cardTitle, fontWeight: "700", marginTop: 11 },
  emptyBody: {
    fontSize: typeScale.metadata,
    lineHeight: typeLeading.tab,
    textAlign: "center",
    maxWidth: 380,
    marginTop: 5,
  },
});
