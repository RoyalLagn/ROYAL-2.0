import React, { useState } from "react";
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
import AnimatedPressable from "@/components/animated/AnimatedPressable";
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
          <ProfileAction label="Copy Link" accessibilityLabel="Copy Profile Link" icon={Copy} isDark={isDark} onPress={handleCopyLink} />
          <ProfileAction label="Open Profile" accessibilityLabel="Open Public Profile" icon={ExternalLink} isDark={isDark} onPress={handleOpenProfile} />
          <ProfileAction label="Share" accessibilityLabel="Share Profile" icon={Share2} isDark={isDark} onPress={handleShare} />
          <ProfileAction label="Download QR" accessibilityLabel="Download QR Code" icon={QrCode} isDark={isDark} onPress={handleDownloadQr} />
        </View>
      </View>
    </View>
  );
}

function ProfileAction({
  label,
  accessibilityLabel,
  icon: Icon,
  isDark,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  icon: typeof Copy;
  isDark: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      pressScale={0.97}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={[
        styles.actionBtn,
        isDark && styles.actionBtnDark,
        hovered && styles.actionBtnHovered,
      ]}
    >
      <Icon size={13} color="#E91E63" strokeWidth={2.2} />
      <Text numberOfLines={1} style={[styles.actionBtnText, isDark && styles.textDark]}>
        {label}
      </Text>
    </AnimatedPressable>
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
    minWidth: 0,
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
    minWidth: 0,
  },
  bodyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    minWidth: 0,
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
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  actionBtn: {
    width: "48%",
    minWidth: 0,
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
    minWidth: 0,
  },
  textDark: {
    color: "#F9FAFB",
  },
});
