import React, { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { Calendar } from "lucide-react-native";
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import AnimatedBottomSheet from "@/components/animated/AnimatedBottomSheet";
import { DateField as WebDateField } from "./DateField.web";

export type DateFieldProps = {
  label: string;
  value: string; // "YYYY-MM-DD", or "" for unset
  onChange: (value: string) => void;
  placeholder?: string;
  displayValue?: string;
  hideLabel?: boolean;
  // Inclusive lower bound, "YYYY-MM-DD" — used to stop End Date from being
  // picked earlier than Start Date directly inside the native picker.
  minimumDate?: string;
  maximumDate?: string;
};

// Same "YYYY-MM-DD" the rest of the CRM (create payload, RPCs) already
// expects — built from local date parts rather than toISOString(), which
// would shift the day in negative-UTC-offset timezones.
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Parses as a local date, not UTC midnight (`new Date("YYYY-MM-DD")` is UTC
// and can display as the previous day in negative-offset timezones).
function parseDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

// Native (iOS/Android) date field — visually identical to the plain
// TextInput boxes elsewhere on this screen (same border/rounded-2xl/h-12/
// px-4/bg-background), but backed by the platform's real date picker
// instead of manual typing.
export function DateField({ label, value, onChange, placeholder = "Select a date", displayValue, hideLabel = false, minimumDate, maximumDate }: DateFieldProps) {
  const [iosOpen, setIosOpen] = useState(false);

  if (Platform.OS === "web") {
    return <WebDateField label={label} value={value} onChange={onChange} placeholder={placeholder} displayValue={displayValue} hideLabel={hideLabel} minimumDate={minimumDate} maximumDate={maximumDate} />;
  }
  const selected = parseDate(value);
  const min = minimumDate ? parseDate(minimumDate) : undefined;
  const max = maximumDate ? parseDate(maximumDate) : undefined;

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "ios") {
      // iOS keeps the inline picker open until the user dismisses it —
      // update live as they scroll the wheel/calendar.
      if (date) onChange(formatDate(date));
      return;
    }
    // Android's dialog closes itself; `dismissed` means Cancel was tapped.
    if (event.type === "set" && date) onChange(formatDate(date));
  };

  const openPicker = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: selected ?? new Date(),
        mode: "date",
        minimumDate: min,
        maximumDate: max,
        onChange: handleChange,
      });
    } else {
      setIosOpen(true);
    }
  };

  return (
    <View className={hideLabel ? "mb-0" : "mb-3"}>
      {!hideLabel ? <Text className="text-foreground text-xs font-semibold mb-1.5">{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${displayValue || value || placeholder}`}
        onPress={openPicker}
        className="h-12 border border-border rounded-2xl px-4 flex-row items-center justify-between bg-card"
        style={({ pressed }) => pressed ? { transform: [{ scale: 0.98 }], opacity: 0.9 } : undefined}
      >
        <Text className={value ? "text-foreground" : "text-muted-foreground"}>{displayValue || value || placeholder}</Text>
        <View className="w-8 h-8 rounded-xl bg-primary/10 items-center justify-center">
          <Calendar size={16} className="text-primary" />
        </View>
      </Pressable>

      {Platform.OS === "ios" ? (
        // Presented as a bottom sheet (shared chrome: backdrop fade + sheet
        // rise, same as StatusBottomSheet et al.) instead of an inline panel
        // that used to push the rest of the form down — the screen behind it
        // never shifts, and it dismisses on Done or on tapping the backdrop.
        <AnimatedBottomSheet visible={iosOpen} onRequestClose={() => setIosOpen(false)}>
          <View className="p-5">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-foreground text-lg font-bold">{label}</Text>
              <Pressable accessibilityLabel="Done" onPress={() => setIosOpen(false)}>
                <Text className="text-primary text-sm font-bold">Done</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={selected ?? new Date()}
              mode="date"
              display="inline"
              minimumDate={min}
              maximumDate={max}
              onChange={handleChange}
            />
          </View>
        </AnimatedBottomSheet>
      ) : null}
    </View>
  );
}
