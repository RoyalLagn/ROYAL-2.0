import React, { useState } from "react";
import { CalendarDays, MessageCircle, MessageSquareText, PackageCheck, Phone } from "lucide-react-native";
import { Platform, StyleSheet, Text, View } from "react-native";
import { fonts, typeScale, typeLeading } from "@/constants/typography";
// NativeWind's native Pressable interop drops function `style={(state) =>
// [...]}` props on Android; InteropSafePressable resolves it first.
import Pressable from "@/components/InteropSafePressable";

export type VendorQuickActionsProps = {
  dark?: boolean;
  onCall: () => void;
  onWhatsApp: () => void;
  onEnquire: () => void;
  onBook?: () => void;
  onCalendar: () => void;
  callDisabled?: boolean;
  whatsAppDisabled?: boolean;
  enquireDisabled?: boolean;
};

type ActionItemProps = {
  label: string;
  accessibilityLabel: string;
  backgroundColor: string;
  activeBackgroundColor: string;
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
  activeBackgroundColor,
  disabled,
  onPress,
  icon,
  labelColor,
  borderColor,
}: ActionItemProps) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const active = !disabled && (focused || hovered || pressed);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed: isPressed, hovered: isHovered }) => [
        styles.action,
        (isHovered || focused) && Platform.OS === "web" && !disabled && styles.actionHovered,
        isPressed && !disabled && styles.actionPressed,
        disabled && styles.disabled,
      ]}
    >
      <View
        style={[
          styles.circle,
          { backgroundColor: active ? activeBackgroundColor : backgroundColor, borderColor: active ? "#E91E63" : borderColor },
          pressed && styles.circlePressed,
        ]}
      >
        {icon}
      </View>
      <Text style={[styles.label, { color: active ? "#D93D70" : labelColor }]}>{label}</Text>
    </Pressable>
  );
}

function VendorQuickActions({
  dark = false,
  onCall,
  onWhatsApp,
  onEnquire,
  onBook,
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
        backgroundColor={dark ? "#38252C" : "#FFF5F8"}
        activeBackgroundColor={dark ? "#4A2935" : "#FCE7EE"}
        borderColor={dark ? "#5B3442" : "#F2DDE5"}
        disabled={callDisabled}
        onPress={onCall}
        labelColor={labelColor}
        icon={<Phone size={21} color="#D93D70" strokeWidth={1.9} />}
      />
      <ActionItem
        label="WhatsApp"
        accessibilityLabel="Contact vendor on WhatsApp"
        backgroundColor={dark ? "#38252C" : "#FFF5F8"}
        activeBackgroundColor={dark ? "#4A2935" : "#FCE7EE"}
        borderColor={dark ? "#5B3442" : "#F2DDE5"}
        disabled={whatsAppDisabled}
        onPress={onWhatsApp}
        labelColor={labelColor}
        icon={<MessageCircle size={21} color="#D93D70" strokeWidth={1.9} />}
      />
      {onBook ? (
        <ActionItem
          label="Book (30%)"
          accessibilityLabel="Book vendor package with 30 percent advance"
          backgroundColor={dark ? "#3A1A28" : "#FFF0F5"}
          activeBackgroundColor={dark ? "#5C1E39" : "#FCE7EE"}
          borderColor={dark ? "#E91E63" : "#F49DBF"}
          onPress={onBook}
          labelColor={labelColor}
          icon={<PackageCheck size={21} color="#E91E63" strokeWidth={2.2} />}
        />
      ) : (
        <ActionItem
          label="Enquire"
          accessibilityLabel="Send vendor enquiry"
          backgroundColor={dark ? "#38252C" : "#FFF5F8"}
          activeBackgroundColor={dark ? "#4A2935" : "#FCE7EE"}
          borderColor={dark ? "#5B3442" : "#F2DDE5"}
          disabled={enquireDisabled}
          onPress={onEnquire}
          labelColor={labelColor}
          icon={<MessageSquareText size={21} color="#D93D70" strokeWidth={1.9} />}
        />
      )}
      <ActionItem
        label="Calendar"
        accessibilityLabel="View vendor calendar"
        backgroundColor={dark ? "#38252C" : "#FFF5F8"}
        activeBackgroundColor={dark ? "#4A2935" : "#FCE7EE"}
        borderColor={dark ? "#5B3442" : "#F2DDE5"}
        onPress={onCalendar}
        labelColor={labelColor}
        icon={<CalendarDays size={21} color="#D93D70" strokeWidth={1.9} />}
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
    marginTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: 16,
    paddingBottom: 16,
  },
  action: {
    width: "24%",
    maxWidth: 112,
    minWidth: 68,
    alignItems: "center",
    gap: 6,
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontFamily: fonts.sans.semibold, fontSize: typeScale.metadata, lineHeight: typeLeading.caption, textAlign: "center" },
  actionHovered: { opacity: 0.9 },
  actionPressed: { transform: [{ scale: 0.97 }], opacity: 0.82 },
  circlePressed: { transform: [{ scale: 0.96 }] },
  disabled: { opacity: 0.45 },
});
