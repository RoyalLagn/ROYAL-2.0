import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, Save } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import VendorDashboardReveal from "@/components/vendor/VendorDashboardReveal";
import { VENDOR_TAB_BASE_HEIGHT } from "@/components/vendor/VendorBottomNav";
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import { interactionTokens } from "@/constants/interactionTokens";
import { KeyboardAwareScrollView } from "@/components/keyboard/KeyboardAwareScrollView";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { updateVendorPublicProfile, type VendorBusinessHourEntry } from "@/services/vendorProfile";
import { invalidatePublicVendorCache } from "@/services/publicVendorListings";
import {
  listEffectiveVendorAvailability,
  setVendorAvailabilityException,
  type AvailabilityStatus,
} from "@/services/vendorAvailability";
import { useAppFeedback } from "@/context/AppFeedbackContext";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const defaultHours = (): VendorBusinessHourEntry[] =>
  DAY_LABELS.map((_, day) => ({ day, opens: "09:00", closes: "18:00", closed: false }));

const validTime = (value: string) => {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
};

const cleanTime = (value: string) => value.replace(/[^0-9:]/g, "").slice(0, 5);

const statusColors: Record<AvailabilityStatus, { background: string; text: string }> = {
  available: { background: "#16A34A", text: "#FFFFFF" },
  tentative: { background: "#FACC15", text: "#3C2A00" },
  blocked: { background: "#DC2626", text: "#FFFFFF" },
};
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function VendorCalendar() {
  const { width } = useWindowDimensions();
  const wideWebLayout = Platform.OS === "web" && width >= 1180;
  const compactHours = width < 560;
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { showSuccess } = useAppFeedback();
  const { data, refresh } = useVendorWorkspace();
  const insets = useSafeAreaInsets();
  // Grid/button sizes are derived from each row's own measured `onLayout`
  // width rather than `useWindowDimensions()`. Two independent Android
  // layout bugs live here: (1) Yoga can mis-resolve `aspectRatio` combined
  // with percentage widths inside `flexWrap` (the day grid), and (2) on
  // some Expo Go/Android runtimes `useWindowDimensions()` does not reliably
  // reflect the actual rendered content width at mount time, which silently
  // produced a near-zero/invalid computed width for calendar cells.
  // Measuring the real grid width directly with onLayout sidesteps both:
  // it is always the true available space, regardless of window timing or
  // Yoga's aspectRatio resolution order.
  const [calendarGridWidth, setCalendarGridWidth] = useState(0);
  const cellSize = calendarGridWidth ? Math.floor(calendarGridWidth / 7) : 0;
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [savedStatuses, setSavedStatuses] = useState<Record<string, AvailabilityStatus>>({});
  const [bookingBlockedDates, setBookingBlockedDates] = useState<Set<string>>(new Set());
  const [savingStatus, setSavingStatus] = useState<AvailabilityStatus | null>(null);
  const [hours, setHours] = useState<VendorBusinessHourEntry[]>(defaultHours());
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);
  const [hoursError, setHoursError] = useState("");
  const mounted = useRef(true);
  const today = iso(new Date());

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!data.vendor) return;
    const existing = Array.isArray(data.vendor.business_hours) ? data.vendor.business_hours : null;
    if (!existing?.length) { setHours(defaultHours()); return; }
    setHours(DAY_LABELS.map((_, day) => {
      const found = existing.find((entry: VendorBusinessHourEntry) => entry.day === day);
      return found ?? { day, opens: "09:00", closes: "18:00", closed: false };
    }));
  }, [data.vendor]);

  const updateHourEntry = (day: number, patch: Partial<VendorBusinessHourEntry>) => {
    setHoursSaved(false);
    setHoursError("");
    setHours((current) => current.map((entry) => (entry.day === day ? { ...entry, ...patch } : entry)));
  };

  const saveHours = async () => {
    if (hoursSaving || !data.vendor?.id) return;
    const invalidEntry = hours.find((entry) => {
      if (entry.closed) return false;
      const opens = validTime(entry.opens);
      const closes = validTime(entry.closes);
      return opens === null || closes === null || opens >= closes;
    });
    if (invalidEntry) {
      const message = `Enter valid opening and closing times for ${DAY_LABELS[invalidEntry.day]}. Closing time must be later than opening time.`;
      setHoursError(message);
      return Alert.alert("Check working hours", message);
    }
    setHoursSaving(true);
    setHoursError("");
    try {
      await updateVendorPublicProfile({ business_hours: hours });
      if (!mounted.current) return;
      invalidatePublicVendorCache();
      await refresh();
      if (!mounted.current) return;
      setHoursSaved(true);
      setTimeout(() => { if (mounted.current) setHoursSaved(false); }, 2200);
    } catch (caught) {
      if (!mounted.current) return;
      const message = caught instanceof Error ? caught.message : "Unable to update working hours.";
      setHoursError(message);
      Alert.alert("Working hours not saved", message);
    } finally {
      if (mounted.current) setHoursSaving(false);
    }
  };
  const days = useMemo(() => {
    const result: (Date | null)[] = Array(month.getDay()).fill(null);
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= count; day++) result.push(new Date(month.getFullYear(), month.getMonth(), day));
    while (result.length % 7) result.push(null);
    return result;
  }, [month]);
  useEffect(() => {
    setSavedStatuses((current) => {
      const next = { ...current };
      data.availability.forEach((item) => {
        if (item.date && item.status !== "available") next[item.date] = item.status;
      });
      return next;
    });
  }, [data.availability]);

  useEffect(() => {
    if (!data.vendor?.id) return;
    const firstDay = iso(month);
    const lastDay = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    let active = true;
    listEffectiveVendorAvailability(data.vendor.id, firstDay, lastDay)
      .then((rows) => {
        if (!active) return;
        setSavedStatuses((current) => {
          const next = { ...current };
          Object.keys(next).forEach((date) => {
            if (date >= firstDay && date <= lastDay) delete next[date];
          });
          rows.filter((row) => row.isException).forEach((row) => { next[row.date] = row.status; });
          return next;
        });
        setBookingBlockedDates((current) => {
          const next = new Set([...current].filter((date) => date < firstDay || date > lastDay));
          rows.filter((row) => row.bookingBlocked).forEach((row) => next.add(row.date));
          return next;
        });
      })
      .catch((error) => { if (active) Alert.alert("Availability not loaded", error.message); });
    return () => { active = false; };
  }, [data.vendor?.id, month]);

  const dateStatus = (date: string): AvailabilityStatus | undefined => {
    if (date < today) return undefined;
    if (bookingBlockedDates.has(date)) return "blocked";
    return savedStatuses[date] ?? "available";
  };
  const update = async (status: AvailabilityStatus, date: string) => {
    if (date < today) {
      return Alert.alert("Past date is locked", "Availability records for past dates are read-only and cannot be changed.");
    }
    if (!data.vendor?.id) return Alert.alert("Vendor profile required", "Connect a vendor profile before changing availability.");
    if (savingStatus) return;
    const previousStatus = savedStatuses[date];
    setSavedStatuses((current) => {
      const next = { ...current };
      if (status === "available") delete next[date];
      else next[date] = status;
      return next;
    });
    setSavingStatus(status);
    let error: unknown = null;
    try {
      await setVendorAvailabilityException(data.vendor.id, date, status);
    } catch (caught) {
      error = caught;
    }
    setSavingStatus(null);
    if (error) {
      setSavedStatuses((current) => {
        const next = { ...current };
        if (previousStatus) next[date] = previousStatus;
        else delete next[date];
        return next;
      });
      Alert.alert("Availability not saved", error instanceof Error ? error.message : "Please try again.");
      return;
    }
    void refresh();
    showSuccess(
      status === "available"
        ? bookingBlockedDates.has(date)
          ? `${date} still has a confirmed booking and remains blocked.`
          : `${date} is available by default.`
        : `${date} is now booked.`,
    );
  };
  const toggleBookedDate = (date: string) => {
    if (bookingBlockedDates.has(date)) return;
    void update(dateStatus(date) === "blocked" ? "available" : "blocked", date);
  };
  return <View style={[styles.page, { backgroundColor: colors.background }]}>
    <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
    <KeyboardAwareScrollView
      contentContainerStyle={[styles.content, wideWebLayout && styles.wideWebContent, { paddingBottom: 24 + Math.max(insets.bottom, 8) + VENDOR_TAB_BASE_HEIGHT + 16 }]}
      showsVerticalScrollIndicator={false}
      decelerationRate="fast"
    >
      <VendorDashboardReveal>
      <Text style={[styles.eyebrow, { color: colors.pink }]}>PLAN WITH CLARITY</Text>
      <Text style={[styles.title, { color: colors.text }]}>Availability</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Tap a future date to mark it booked. Tap it again to make it available.</Text>
      <View style={wideWebLayout && styles.workspaceWide}>
      <View style={[styles.calendar, wideWebLayout && styles.wideWebPanel, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
        <View style={styles.monthRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            style={({ pressed, hovered, focused }) => [
              styles.arrow,
              { backgroundColor: colors.surfaceSoft },
              (hovered || focused) && styles.hoverLift,
              pressed && styles.pressed,
            ]}
          ><ChevronLeft size={20} color={colors.text} /></Pressable>
          <Text style={[styles.month, { color: colors.text }]}>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next month"
            onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            style={({ pressed, hovered, focused }) => [
              styles.arrow,
              { backgroundColor: colors.surfaceSoft },
              (hovered || focused) && styles.hoverLift,
              pressed && styles.pressed,
            ]}
          ><ChevronRight size={20} color={colors.text} /></Pressable>
        </View>
        <View onLayout={(event) => setCalendarGridWidth(event.nativeEvent.layout.width)} style={styles.grid}>{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <Text key={`${day}${index}`} style={[styles.weekday, cellSize ? { width: cellSize } : null, { color: colors.muted }]}>{day}</Text>)}
          {days.map((date, index) => {
            if (!date) return <View key={`blank${index}`} style={[styles.day, cellSize ? { width: cellSize, height: cellSize } : null]} />;
            const value = iso(date);
            const status = dateStatus(value);
            const past = value < today;
            const palette = status ? statusColors[status] : null;
            const backgroundColor = past
              ? colorScheme === "dark" ? "#292C33" : "#E8E8EC"
              : palette?.background ?? "transparent";
            const dateColor = past
              ? colorScheme === "dark" ? "#747982" : "#9A9AA1"
              : palette?.text ?? colors.text;
            return <Pressable
              key={value}
              accessibilityLabel={`${date.toLocaleDateString()}${past ? ", past date, locked" : status === "blocked" ? ", booked, tap to make available" : ", available, tap to mark booked"}`}
              accessibilityState={{ disabled: past || savingStatus !== null, selected: status === "blocked", busy: savingStatus !== null }}
              disabled={past || savingStatus !== null}
              onPress={() => toggleBookedDate(value)}
              style={({ pressed, hovered, focused }) => [
                styles.day,
                cellSize ? { width: cellSize, height: cellSize } : null,
                { backgroundColor },
                past && styles.pastDay,
                !past && (hovered || focused) && styles.dayHover,
                !past && pressed && styles.dayPressed,
              ]}
            >
              <Text style={[styles.dayText, { color: dateColor }]}>{date.getDate()}</Text>
            </Pressable>;
          })}
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: colors.surfaceSoft, borderColor: colors.border, borderWidth: StyleSheet.hairlineWidth }]} /><Text style={[styles.legendText, { color: colors.muted }]}>Available</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: statusColors.blocked.background }]} /><Text style={[styles.legendText, { color: colors.muted }]}>Booked</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: colorScheme === "dark" ? "#292C33" : "#E8E8EC" }]} /><Text style={[styles.legendText, { color: colors.muted }]}>Past · locked</Text></View>
        </View>
      </View>
      <View style={[styles.editor, wideWebLayout && styles.wideWebPanel, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
        <Text style={[styles.editorTitle, { color: colors.text }]}>Weekly working hours</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>All days are available by default. Turn off only the days your business is regularly closed.</Text>
        <View style={styles.hoursList}>
          {hours.map((entry) => (
            <View key={entry.day} style={[styles.hourRow, compactHours && styles.hourRowCompact, { borderColor: colors.border }]}>
              <View style={[styles.hourDayRow, compactHours && styles.hourDayRowCompact]}>
                <Text style={[styles.hourDay, { color: colors.text }]}>{DAY_LABELS[entry.day]}</Text>
                {compactHours ? <AvailabilityToggle entry={entry} colors={colors} onChange={(open) => updateHourEntry(entry.day, {
                  closed: !open,
                  opens: open && validTime(entry.opens) === null ? "09:00" : entry.opens,
                  closes: open && validTime(entry.closes) === null ? "18:00" : entry.closes,
                })} /> : null}
              </View>
              {entry.closed ? (
                <Text style={[styles.hourClosedText, { color: colors.muted }]}>Not available</Text>
              ) : (
                <View style={styles.hourInputs}>
                  <TextInput
                    value={entry.opens}
                    onChangeText={(value) => updateHourEntry(entry.day, { opens: cleanTime(value) })}
                    placeholder="09:00"
                    placeholderTextColor={colors.muted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    accessibilityLabel={`${DAY_LABELS[entry.day]} opening time`}
                    style={[styles.hourInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                  />
                  <Text style={[styles.hourSeparator, { color: colors.muted }]}>–</Text>
                  <TextInput
                    value={entry.closes}
                    onChangeText={(value) => updateHourEntry(entry.day, { closes: cleanTime(value) })}
                    placeholder="18:00"
                    placeholderTextColor={colors.muted}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    accessibilityLabel={`${DAY_LABELS[entry.day]} closing time`}
                    style={[styles.hourInput, { borderColor: colors.border, color: colors.text, backgroundColor: colors.background }]}
                  />
                </View>
              )}
              {!compactHours ? <AvailabilityToggle entry={entry} colors={colors} onChange={(open) => updateHourEntry(entry.day, {
                closed: !open,
                opens: open && validTime(entry.opens) === null ? "09:00" : entry.opens,
                closes: open && validTime(entry.closes) === null ? "18:00" : entry.closes,
              })} /> : null}
            </View>
          ))}
        </View>
        <View style={styles.hoursSaveRow}>
          {hoursError ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={[styles.hoursError, { color: colors.destructive }]}>{hoursError}</Text>
            : hoursSaved ? <Text accessibilityLiveRegion="polite" style={[styles.hoursSaved, { color: colors.success }]}>Working hours updated</Text>
            : <Text style={[styles.hoursHint, { color: colors.muted }]}>Available days appear on your public profile.</Text>}
          <Pressable disabled={hoursSaving} accessibilityRole="button" accessibilityState={{ disabled: hoursSaving }} onPress={() => void saveHours()} style={({ pressed, hovered, focused }) => [styles.hoursSave, { backgroundColor: colors.pink }, (hovered || focused) && styles.hoverLift, hoursSaving && styles.disabled, pressed && styles.pressed]}>
            {hoursSaving ? <ActivityIndicator color="#FFF" size="small" /> : <><Save size={14} color="#FFF" /><Text style={styles.hoursSaveText}>Save hours</Text></>}
          </Pressable>
        </View>
      </View>
      </View>
      </VendorDashboardReveal>
    </KeyboardAwareScrollView>
  </View>;
}

function AvailabilityToggle({ entry, colors, onChange }: {
  entry: VendorBusinessHourEntry;
  colors: (typeof vendorTheme)[keyof typeof vendorTheme];
  onChange: (open: boolean) => void;
}) {
  const open = !entry.closed;
  return (
    <View style={styles.availabilityControl}>
      <Text style={[styles.availabilityLabel, { color: open ? colors.success : colors.muted }]}>{open ? "Available" : "Closed"}</Text>
      <Switch
        value={open}
        onValueChange={onChange}
        trackColor={{ true: colors.pink, false: colors.border }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={colors.border}
        accessibilityLabel={`${DAY_LABELS[entry.day]} availability`}
        accessibilityHint="Turn off to mark this day as regularly closed"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { padding: 16, paddingTop: 20, paddingBottom: 24, width: "100%", maxWidth: 780, alignSelf: "center" },
  wideWebContent: { maxWidth: 1120, paddingHorizontal: 28, paddingTop: 28 },
  eyebrow: { ...typeStyles.caption, letterSpacing: 1.1, marginBottom: 5 }, title: { ...typeStyles.pageTitle },
  subtitle: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, marginTop: 4 }, calendar: { borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 20, shadowOffset: { width: 0, height: 8 }, shadowOpacity: .05, shadowRadius: 18, elevation: 2 },
  workspaceWide: { flexDirection: "row", alignItems: "flex-start", gap: 18, marginTop: 20 }, wideWebPanel: { flex: 1, minWidth: 0, marginTop: 0 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }, month: { fontSize: typeScale.cardTitle, fontWeight: "700" }, arrow: { width: interactionTokens.minimumTouchTarget, height: interactionTokens.minimumTouchTarget, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" }, weekday: { width: "14.285%", textAlign: "center", fontSize: typeScale.caption, fontWeight: "700", paddingVertical: 8 },
  day: { width: "14.285%", borderRadius: 12, alignItems: "center", justifyContent: "center", transform: [{ scale: .92 }] }, dayText: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.metadata, fontWeight: "700" }, pastDay: { opacity: .6 }, dayHover: { transform: [{ scale: .95 }] }, dayPressed: { transform: [{ scale: .89 }], opacity: .9 },
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 13, paddingTop: 16 }, legendItem: { flexDirection: "row", alignItems: "center", gap: 5 }, legendSwatch: { width: 10, height: 10, borderRadius: 3 }, legendText: { fontSize: typeScale.caption, fontWeight: "700" },
  editor: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 14, shadowOffset: { width: 0, height: 8 }, shadowOpacity: .045, shadowRadius: 16, elevation: 1 }, editorTitle: { fontSize: typeScale.cardTitle, fontWeight: "700" },
  hoverLift: { transform: [{ translateY: -1 }] }, pressed: { transform: [{ scale: .98 }], opacity: .9 },
  hoursList: { marginTop: 14, gap: 4 },
  hourRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  hourRowCompact: { alignItems: "stretch", flexDirection: "column", gap: 9 },
  hourDayRow: { width: 90, flexShrink: 0 },
  hourDayRowCompact: { width: "100%", minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  hourDay: { fontSize: typeScale.metadata, fontWeight: "700" },
  hourClosedText: { flex: 1, fontSize: typeScale.metadata, fontWeight: "600" },
  hourInputs: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 7 },
  hourInput: { flex: 1, flexBasis: 0, minWidth: 0, minHeight: interactionTokens.minimumTouchTarget, borderWidth: 1, borderRadius: 11, paddingHorizontal: 10, fontSize: typeScale.metadata, textAlign: "center" },
  hourSeparator: { fontSize: typeScale.metadata, fontWeight: "700" },
  availabilityControl: { width: 116, minHeight: interactionTokens.minimumTouchTarget, flexShrink: 0, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 7 },
  availabilityLabel: { fontSize: typeScale.caption, fontWeight: "700" },
  hoursSaveRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 16 },
  hoursHint: { flex: 1, fontSize: typeScale.caption },
  hoursSaved: { flex: 1, fontSize: typeScale.caption, fontWeight: "700" },
  hoursError: { flex: 1, fontSize: typeScale.caption, lineHeight: typeLeading.label, fontWeight: "700" },
  hoursSave: { minHeight: interactionTokens.minimumTouchTarget, minWidth: 118, borderRadius: 13, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  hoursSaveText: { color: "#FFF", fontSize: typeScale.caption, fontWeight: "700" },
  disabled: { opacity: .6 },
});
