import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  View,
  Linking,
  Platform,
} from "react-native";
import { FileCheck, MessageCircle, X, Download, ExternalLink } from "lucide-react-native";
import Pressable from "@/components/InteropSafePressable";

interface TicketPdfFallbackModalProps {
  visible: boolean;
  fileName: string;
  ticketId?: string;
  onClose: () => void;
  dark?: boolean;
}

export default function TicketPdfFallbackModal({
  visible,
  fileName,
  ticketId,
  onClose,
  dark = false,
}: TicketPdfFallbackModalProps) {
  if (!visible) return null;

  const handleOpenWhatsAppWeb = () => {
    // Open WhatsApp Web on desktop browsers or WhatsApp app URL scheme
    const url = "https://web.whatsapp.com";
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.open(url, "_blank");
    } else {
      void Linking.openURL(url);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        {/* Backdrop Tap to Close */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss dialog"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />

        <View style={[s.modalCard, dark && s.modalCardDark]}>
          {/* Header */}
          <View style={s.headerRow}>
            <View style={s.iconBadge}>
              <FileCheck size={20} color="#16A34A" strokeWidth={2.4} />
            </View>
            <View style={s.headerTextWrap}>
              <Text style={[s.title, dark && s.textWhite]}>Ticket PDF Downloaded</Text>
              <Text style={s.subtitle}>Ready to attach on WhatsApp</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={s.closeBtn}
            >
              <X size={16} color={dark ? "#9CA3AF" : "#6B7280"} />
            </Pressable>
          </View>

          {/* Downloaded File Pill */}
          <View style={[s.filePill, dark && s.filePillDark]}>
            <Download size={14} color="#D97706" strokeWidth={2.4} />
            <Text style={[s.fileName, dark && s.fileNameDark]} numberOfLines={1}>
              {fileName}
            </Text>
          </View>

          <Text style={[s.descText, dark && s.descTextDark]}>
            Your official RoyalLagn luxury E-Ticket has been downloaded to your device&apos;s{" "}
            <Text style={s.boldText}>Downloads</Text> folder.
          </Text>

          {/* Step-by-Step Instructions */}
          <View style={[s.stepsBox, dark && s.stepsBoxDark]}>
            <Text style={[s.stepsHeader, dark && s.stepsHeaderDark]}>
              HOW TO SEND ON WHATSAPP:
            </Text>
            <View style={s.stepItem}>
              <Text style={s.stepNum}>1.</Text>
              <Text style={[s.stepText, dark && s.stepTextDark]}>
                Open WhatsApp Web or WhatsApp Desktop.
              </Text>
            </View>
            <View style={s.stepItem}>
              <Text style={s.stepNum}>2.</Text>
              <Text style={[s.stepText, dark && s.stepTextDark]}>
                Select the contact or vendor you wish to send the ticket to.
              </Text>
            </View>
            <View style={s.stepItem}>
              <Text style={s.stepNum}>3.</Text>
              <Text style={[s.stepText, dark && s.stepTextDark]}>
                Click the <Text style={s.boldText}>Attach (📎)</Text> icon, choose{" "}
                <Text style={s.boldText}>Document</Text>, and select{" "}
                <Text style={s.boldText}>{fileName}</Text>.
              </Text>
            </View>
          </View>

          {/* Honest browser disclaimer */}
          <Text style={[s.noticeText, dark && s.noticeTextDark]}>
            * Browser security policies do not allow web pages to automatically attach local files
            into WhatsApp Web. Please attach the downloaded PDF document manually.
          </Text>

          {/* Actions */}
          <View style={s.actionsRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open WhatsApp Web"
              onPress={handleOpenWhatsAppWeb}
              style={s.whatsappBtn}
            >
              <MessageCircle size={16} color="#FFFFFF" strokeWidth={2.4} />
              <Text style={s.whatsappBtnText}>Open WhatsApp Web</Text>
              <ExternalLink size={13} color="#FFFFFF" strokeWidth={2} />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              onPress={onClose}
              style={[s.doneBtn, dark && s.doneBtnDark]}
            >
              <Text style={[s.doneBtnText, dark && s.doneBtnTextDark]}>Done</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: "#F1E1E7",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  modalCardDark: {
    backgroundColor: "#131A28",
    borderColor: "#2B3B54",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  textWhite: {
    color: "#F9FAFB",
  },
  subtitle: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
  },
  filePill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 14,
  },
  filePillDark: {
    backgroundColor: "#2E220C",
    borderColor: "#634915",
  },
  fileName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#92400E",
    flex: 1,
  },
  fileNameDark: {
    color: "#FDE68A",
  },
  descText: {
    fontSize: 13,
    lineHeight: 18,
    color: "#4B5563",
    marginBottom: 14,
  },
  descTextDark: {
    color: "#9CA3AF",
  },
  boldText: {
    fontWeight: "700",
  },
  stepsBox: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  stepsBoxDark: {
    backgroundColor: "#1A2332",
    borderColor: "#2B3A52",
  },
  stepsHeader: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#6B7280",
    marginBottom: 8,
  },
  stepsHeaderDark: {
    color: "#9CA3AF",
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  stepNum: {
    fontSize: 12,
    fontWeight: "700",
    color: "#E11D48",
    width: 18,
    lineHeight: 18,
  },
  stepText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#374151",
    flex: 1,
  },
  stepTextDark: {
    color: "#D1D5DB",
  },
  noticeText: {
    fontSize: 11,
    lineHeight: 15,
    color: "#9CA3AF",
    marginBottom: 18,
    fontStyle: "italic",
  },
  noticeTextDark: {
    color: "#6B7280",
  },
  actionsRow: {
    flexDirection: "column",
    gap: 10,
  },
  whatsappBtn: {
    backgroundColor: "#16A34A",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  whatsappBtnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  doneBtn: {
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
  },
  doneBtnDark: {
    backgroundColor: "#1F2937",
  },
  doneBtnText: {
    color: "#4B5563",
    fontSize: 13,
    fontWeight: "600",
  },
  doneBtnTextDark: {
    color: "#D1D5DB",
  },
});
