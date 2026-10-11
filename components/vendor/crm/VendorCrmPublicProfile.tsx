import React from "react";
import {
  Alert,
  Image,
  Linking,
  Platform,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  Copy,
  ExternalLink,
  QrCode,
  Share2,
} from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";

export interface VendorCrmPublicProfileProps {
  slug?: string;
  businessName?: string;
}

export default function VendorCrmPublicProfile({
  slug = "tejas-photography-pune",
  businessName = "Tejas Photography",
}: VendorCrmPublicProfileProps) {
  const { width } = useWindowDimensions();
  const { colorScheme } = useAppTheme();
  const isDark = colorScheme === "dark";
  const isSmall = width < 400;

  const publicUrl = `https://royallagn.com/vendor/${slug}`;
  const qrUri = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(publicUrl)}`;

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(publicUrl);
    Alert.alert("Copied", "Public profile link copied to clipboard!");
  };

  const handleOpenProfile = () => {
    if (Platform.OS === "web") {
      window.open(publicUrl, "_blank");
    } else {
      Linking.openURL(publicUrl).catch(() => {
        Alert.alert("Link", publicUrl);
      });
    }
  };

  const handleShare = () => {
    const message = `Check out ${businessName} on RoyalLagn: ${publicUrl}`;
    void Share.share({ message, url: publicUrl });
  };

  const handleDownloadQr = () => {
    if (Platform.OS === "web") {
      window.open(qrUri, "_blank");
    } else {
      Alert.alert("QR Code", "Ready to share or scan!");
    }
  };

  return (
    <View style={[styles.card, isDark && styles.cardDark]}>
      {/* Header with URL */}
      <View style={styles.headerWrap}>
        <Text style={[styles.title, isDark && styles.textDark]}>
          Public Profile
        </Text>
        <Text numberOfLines={1} style={styles.urlText}>
          {publicUrl}
        </Text>
      </View>

      {/* QR Code and Actions Row */}
      <View style={styles.bodyRow}>
        {/* Fixed QR Code */}
        <View style={[styles.qrBox, isSmall && styles.qrBoxSmall]}>
          <Image
            source={{ uri: qrUri }}
            style={isSmall ? styles.qrImageSmall : styles.qrImage}
            resizeMode="contain"
          />
        </View>

        {/* 2x2 Action Tiles */}
        <View style={styles.actionsGrid}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy Profile Link"
            onPress={handleCopyLink}
            style={({ pressed, hovered }: any) => [
              styles.actionBtn,
              isDark && styles.actionBtnDark,
              hovered && styles.actionBtnHovered,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Copy size={13} color="#E91E63" strokeWidth={2.2} />
            <Text numberOfLines={1} style={[styles.actionBtnText, isDark && styles.textDark]}>
              Copy Link
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open Public Profile"
            onPress={handleOpenProfile}
            style={({ pressed, hovered }: any) => [
              styles.actionBtn,
              isDark && styles.actionBtnDark,
              hovered && styles.actionBtnHovered,
              pressed && { opacity: 0.8 },
            ]}
          >
            <ExternalLink size={13} color="#E91E63" strokeWidth={2.2} />
            <Text numberOfLines={1} style={[styles.actionBtnText, isDark && styles.textDark]}>
              Open Profile
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Share Profile"
            onPress={handleShare}
            style={({ pressed, hovered }: any) => [
              styles.actionBtn,
              isDark && styles.actionBtnDark,
              hovered && styles.actionBtnHovered,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Share2 size={13} color="#E91E63" strokeWidth={2.2} />
            <Text numberOfLines={1} style={[styles.actionBtnText, isDark && styles.textDark]}>
              Share
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Download QR Code"
            onPress={handleDownloadQr}
            style={({ pressed, hovered }: any) => [
              styles.actionBtn,
              isDark && styles.actionBtnDark,
              hovered && styles.actionBtnHovered,
              pressed && { opacity: 0.8 },
            ]}
          >
            <QrCode size={13} color="#E91E63" strokeWidth={2.2} />
            <Text numberOfLines={1} style={[styles.actionBtnText, isDark && styles.textDark]}>
              Download QR
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#FCE7F3",
    padding: 16,
    width: "100%",
    maxWidth: "100%",
    boxSizing: "border-box" as any,
  },
  cardDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
  },
  headerWrap: {
    marginBottom: 10,
  },
  title: {
    fontSize: 13.5,
    fontWeight: "800",
    color: "#111827",
  },
  urlText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#E91E63",
    marginTop: 2,
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
  },
  qrBox: {
    width: 74,
    height: 74,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
    flexShrink: 0,
  },
  qrBoxSmall: {
    width: 64,
    height: 64,
  },
  qrImage: {
    width: 66,
    height: 66,
    borderRadius: 6,
  },
  qrImageSmall: {
    width: 56,
    height: 56,
    borderRadius: 5,
  },
  actionsGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  actionBtn: {
    width: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#FFF0F5",
    paddingVertical: 7,
    paddingHorizontal: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FCE7F3",
  },
  actionBtnDark: {
    backgroundColor: "#111827",
    borderColor: "#374151",
  },
  actionBtnHovered: {
    borderColor: "#E91E63",
  },
  actionBtnText: {
    fontSize: 10.5,
    fontWeight: "700",
    color: "#374151",
    flexShrink: 1,
  },
  textDark: {
    color: "#F9FAFB",
  },
});
