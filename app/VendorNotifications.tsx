import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Bell, CheckCheck } from "lucide-react-native";
import { useRouter } from "expo-router";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorNotifications, type VendorNotification } from "@/context/VendorNotificationContext";
import { SkeletonList } from "@/components/loading/Skeleton";
import AnimatedPressable from "@/components/animated/AnimatedPressable";

const vendorNotificationDestination = (notification: VendorNotification) => {
  if (notification.target_path) return notification.target_path;
  if (notification.kind === "subscription" || notification.kind === "payment") return "/VendorSubscription";
  if (notification.kind === "enquiry") return "/VendorEnquiries";
  if (notification.kind === "review") return "/vendor-dashboard";
  return null;
};

export default function VendorNotifications() {
  const router = useRouter();
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { notifications, unreadCount: unread, loading, markAsRead, markAllAsRead } = useVendorNotifications();
  const openNotification = (notification: VendorNotification) => {
    if (!notification.is_read) {
      void markAsRead(notification.id).then((success) => {
        if (!success) Alert.alert("Notification not updated", "Please check your connection and try again.");
      });
    }
    const destination = vendorNotificationDestination(notification);
    if (destination) router.push(destination as never);
  };
  const readAll = () => {
    void markAllAsRead().then((success) => {
      if (!success) Alert.alert("Notifications not updated", "Please check your connection and try again.");
    });
  };
  return <View style={[styles.page, { backgroundColor: colors.background }]}>
    <VendorHeader />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.heading}><View style={styles.flex}><Text style={[styles.eyebrow, { color: colors.pink }]}>STAY INFORMED</Text><Text style={[styles.title, { color: colors.text }]}>Notifications</Text><Text style={[styles.subtitle, { color: colors.muted }]}>{unread ? `${unread} unread updates` : "You are all caught up."}</Text></View>
        {unread > 0 && <Pressable onPress={readAll} style={[styles.mark, { backgroundColor: colors.surfaceSoft }]}><CheckCheck size={16} color={colors.pink} /><Text style={{ color: colors.pink, fontSize: 10, fontWeight: "800" }}>Read all</Text></Pressable>}</View>
      {loading ? <SkeletonList count={5} height={78} /> : notifications.map((item) => <AnimatedPressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title}${item.is_read ? "" : ", unread"}`} onPress={() => openNotification(item)}
        style={[styles.card, { backgroundColor: colors.surface, borderColor: item.is_read ? colors.border : colors.pink }]}>
        <View style={[styles.icon, { backgroundColor: colors.surfaceSoft }]}><Bell size={18} color={item.is_read ? colors.muted : colors.pink} /></View>
        <View style={styles.flex}><Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text><Text style={[styles.body, { color: colors.muted }]}>{item.body || "Open to mark this notification as read."}</Text><Text style={[styles.date, { color: colors.muted }]}>{new Date(item.created_at).toLocaleString()}</Text></View>
        {!item.is_read && <View style={[styles.dot, { backgroundColor: colors.pink }]} />}
      </AnimatedPressable>)}
      {!loading && !notifications.length && <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}><Bell size={29} color={colors.muted} /><Text style={[styles.emptyTitle, { color: colors.text }]}>No notifications</Text><Text style={[styles.emptyBody, { color: colors.muted }]}>Enquiries, reviews and important account updates will appear here.</Text></View>}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  page: { flex: 1 }, content: { width: "100%", maxWidth: 800, alignSelf: "center", padding: 16, paddingTop: 22, paddingBottom: 24 },
  heading: { flexDirection: "row", gap: 12, alignItems: "flex-start", marginBottom: 20 }, flex: { flex: 1, minWidth: 0 }, eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: "800", marginBottom: 5 },
  title: { fontSize: 28, fontWeight: "800", letterSpacing: -.8 }, subtitle: { fontSize: 12, marginTop: 4 }, mark: { height: 39, borderRadius: 13, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6 },
  card: { borderWidth: 1, borderRadius: 20, padding: 14, marginBottom: 10, flexDirection: "row", alignItems: "flex-start", gap: 11 }, icon: { width: 39, height: 39, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 12, fontWeight: "800" }, body: { fontSize: 11, lineHeight: 16, marginTop: 4 }, date: { fontSize: 9, marginTop: 7 }, dot: { width: 7, height: 7, borderRadius: 4, marginTop: 5 },
  empty: { borderWidth: 1, borderRadius: 23, alignItems: "center", padding: 32 }, emptyTitle: { fontSize: 17, fontWeight: "800", marginTop: 11 }, emptyBody: { fontSize: 11, lineHeight: 17, textAlign: "center", maxWidth: 380, marginTop: 5 },
});
