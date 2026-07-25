import React from "react";
import { CalendarDays, MessageCircle, Phone } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

export type VendorQuickActionsProps = {
  dark?: boolean;
  onCall: () => void;
  onWhatsApp: () => void;
  onEnquire: () => void;
  callDisabled?: boolean;
  whatsAppDisabled?: boolean;
  enquireDisabled?: boolean;
};

type ActionItemProps = {
  label: string;
  accessibilityLabel: string;
  backgroundColor: string;
  disabled?: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  labelColor: string;
  borderColor: string;
};

function ActionItem({
  label,
  accessibilityLabel,
  backgroundColor,
  disabled,
  onPress,
  icon,
  labelColor,
  borderColor,
}: ActionItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.action,
        hovered && Platform.OS === "web" && !disabled && styles.actionHovered,
        pressed && !disabled && styles.actionPressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.circle, { backgroundColor, borderColor }]}>{icon}</View>
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
    </Pressable>
  );
}

export default function VendorQuickActions({
  dark = false,
  onCall,
  onWhatsApp,
  onEnquire,
  callDisabled = false,
  whatsAppDisabled = false,
  enquireDisabled = false,
}: VendorQuickActionsProps) {
  const labelColor = dark ? "#D5C9CE" : "#5F555A";

  return (
    <View style={styles.row}>
      <ActionItem
        label="Call"
        accessibilityLabel="Call vendor"
        backgroundColor={dark ? "#38252C" : "#FFF1F5"}
        borderColor={dark ? "#5B3442" : "#F4CCD9"}
        disabled={callDisabled}
        onPress={onCall}
        labelColor={labelColor}
        icon={<Phone size={24} color="#D93D70" strokeWidth={1.9} />}
      />
      <ActionItem
        label="WhatsApp"
        accessibilityLabel="Contact vendor on WhatsApp"
        backgroundColor={dark ? "#213329" : "#F0FAF1"}
        borderColor={dark ? "#31523D" : "#CFE8D3"}
        disabled={whatsAppDisabled}
        onPress={onWhatsApp}
        labelColor={labelColor}
        icon={<MessageCircle size={26} color="#25A84A" strokeWidth={1.9} />}
      />
      <ActionItem
        label="Enquire"
        accessibilityLabel="Send vendor enquiry"
        backgroundColor={dark ? "#2C2738" : "#F7F3FF"}
        borderColor={dark ? "#463A62" : "#E2D8F6"}
        disabled={enquireDisabled}
        onPress={onEnquire}
        labelColor={labelColor}
        icon={<CalendarDays size={24} color="#815AD9" strokeWidth={1.9} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    paddingTop: 24,
    paddingBottom: 22,
  },
  action: {
    width: "30%",
    maxWidth: 130,
    minWidth: 78,
    alignItems: "center",
    gap: 8,
  },
  circle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 13, fontWeight: "500", textAlign: "center" },
  actionHovered: { transform: [{ translateY: -1 }] },
  actionPressed: { transform: [{ scale: 0.98 }], opacity: 0.88 },
  disabled: { opacity: 0.45 },
});
