import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MessageSquareHeart } from "lucide-react-native";
import { useAppTheme } from "@/components/ThemeProvider";

export default function EnquiryScreen() {
  const { colorScheme } = useAppTheme();
  const dark = colorScheme === "dark";
  const background = dark ? "#070B14" : "#FFFFFF";
  const surface = dark ? "#0E141F" : "#FFF9FB";
  const text = dark ? "#F7F2F4" : "#111827";
  const muted = dark ? "#AAA0A5" : "#6B7280";
  const border = dark ? "#232C3D" : "#F4DCE4";

  return (
    <SafeAreaView style={[styles.page, { backgroundColor: background }]}>
      <View style={styles.content}>
        <Text style={[styles.title, { color: text }]}>My Enquiries</Text>
        <View style={[styles.empty, { backgroundColor: surface, borderColor: border }]}>
          <View style={styles.icon}>
            <MessageSquareHeart size={28} color="#E91E63" strokeWidth={1.8} />
          </View>
          <Text style={[styles.emptyTitle, { color: text }]}>No enquiries yet</Text>
          <Text style={[styles.emptyBody, { color: muted }]}>
            Enquiries you send to wedding vendors will appear here.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { width: "100%", maxWidth: 900, alignSelf: "center", paddingHorizontal: 18, paddingTop: 24 },
  title: { fontFamily: "serif", fontSize: 27, lineHeight: 34, fontWeight: "700", letterSpacing: -0.5 },
  empty: { marginTop: 24, minHeight: 250, borderWidth: 1, borderRadius: 24, padding: 28, alignItems: "center", justifyContent: "center" },
  icon: { width: 58, height: 58, borderRadius: 20, backgroundColor: "#FFF0F6", alignItems: "center", justifyContent: "center" },
  emptyTitle: { marginTop: 16, fontSize: 17, fontWeight: "800" },
  emptyBody: { maxWidth: 360, marginTop: 7, fontSize: 12, lineHeight: 18, textAlign: "center" },
});
