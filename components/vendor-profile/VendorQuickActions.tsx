import React, { useState } from "react";
import { CalendarDays, MessageCircle, MessageSquareText, Phone } from "lucide-react-native";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { fonts, typeScale, typeLeading } from "@/constants/typography";

export type VendorQuickActionsProps = {
  dark?: boolean;
  onCall: () => void;
  onWhatsApp: () => void;
  onEnquire: () => void;
  onCalendar: () => void;
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
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed, hovered }) => [
        styles.action,
        (hovered || focused) && Platform.OS === "web" && !disabled && styles.actionHovered,
        pressed && !disabled && styles.actionPressed,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.circle, { backgroundColor, borderColor }]}>{icon}</View>
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
    </Pressable>
  );
}

function VendorQuickActions({
  dark = false,
  onCall,
  onWhatsApp,
  onEnquire,
  onCalendar,
  callDisabled = false,
  whatsAppDisabled = false,
  enquireDisabled = false,
}: VendorQuickActionsProps) {
  const labelColor = dark ? "#E4DADF" : "#4F454A";

  return (
    <View style={[styles.row, { borderTopColor: dark ? "#232C3D" : "#F2DDE5" }]}>
      <ActionItem
        label="Call"
        accessibilityLabel="Call vendor"
        backgroundColor={dark ? "#38252C" : "#FFF1F5"}
        borderColor={dark ? "#5B3442" : "#F4CCD9"}
        disabled={callDisabled}
        onPress={onCall}
        labelColor={labelColor}
        icon={<Phone size={21} color="#D93D70" strokeWidth={1.9} />}
      />
      <ActionItem
        label="WhatsApp"
        accessibilityLabel="Contact vendor on WhatsApp"
        backgroundColor={dark ? "#213329" : "#F0FAF1"}
        borderColor={dark ? "#31523D" : "#CFE8D3"}
        disabled={whatsAppDisabled}
        onPress={onWhatsApp}
        labelColor={labelColor}
        icon={<MessageCircle size={22} color="#25A84A" strokeWidth={1.9} />}
      />
      <ActionItem
        label="Enquire"
        accessibilityLabel="Send vendor enquiry"
        backgroundColor={dark ? "#2C2738" : "#F7F3FF"}
        borderColor={dark ? "#463A62" : "#E2D8F6"}
        disabled={enquireDisabled}
        onPress={onEnquire}
        labelColor={labelColor}
        icon={<MessageSquareText size={21} color="#815AD9" strokeWidth={1.9} />}
      />
      <ActionItem
        label="Calendar"
        accessibilityLabel="View vendor calendar"
        backgroundColor={dark ? "#382F20" : "#FFF8E8"}
        borderColor={dark ? "#665331" : "#F0D8A4"}
        onPress={onCalendar}
        labelColor={labelColor}
        icon={<CalendarDays size={21} color="#B7791F" strokeWidth={1.9} />}
      />
    </View>
  );
}

export default React.memo(VendorQuickActions);

const styles = StyleSheet.create({
  row: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: 14,
    paddingBottom: 14,
  },
  action: {
    width: "24%",
    maxWidth: 112,
    minWidth: 68,
    alignItems: "center",
    gap: 6,
  },
  circle: {
    width: 46,
    height: 46,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#87455D",
    shadowOpacity: 0.035,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  label: { fontFamily: fonts.sans.semibold, fontSize: typeScale.metadata, lineHeight: typeLeading.caption, textAlign: "center" },
  actionHovered: { transform: [{ translateY: -2 }] },
  actionPressed: { transform: [{ scale: 0.94 }], opacity: 0.88 },
  disabled: { opacity: 0.45 },
});
