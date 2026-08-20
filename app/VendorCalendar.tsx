import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight, CircleCheck, Clock3, LockKeyhole, Save } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import VendorDashboardReveal from "@/components/vendor/VendorDashboardReveal";
import { VENDOR_TAB_BASE_HEIGHT } from "@/components/vendor/VendorBottomNav";
// The Tentative/Blocked controls use a function `style={(state) => [...]}`
// prop (to react to `pressed`). NativeWind's native Pressable interop does
// not resolve that render-prop form on Android -- the whole style silently
// drops (children still render), which is why those controls showed as
// bare icon+text with no visible pill. InteropSafePressable (already used
// elsewhere in the app for the same reason) resolves the callback style
// itself before handing a plain style to the underlying Pressable.
import Pressable from "@/components/InteropSafePressable";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { typeStyles, typeScale, typeLeading } from "@/constants/typography";
import { interactionTokens } from "@/constants/interactionTokens";
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

const statuses = [
  { id: "tentative", label: "Tentative", icon: Clock3 },
  { id: "blocked", label: "Blocked", icon: LockKeyhole },
] as const;
const statusColors: Record<AvailabilityStatus, { background: string; text: string }> = {
  available: { background: "#16A34A", text: "#FFFFFF" },
  tentative: { background: "#FACC15", text: "#3C2A00" },
  blocked: { background: "#DC2626", text: "#FFFFFF" },
};
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const STATUS_GAP = 8;

export default function VendorCalendar() {
  const { width } = useWindowDimensions();
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
  // produced a near-zero/invalid computed width for the Tentative/Blocked
  // buttons and made them collapse to their unstyled intrinsic content
  // size. Measuring the real row width directly with onLayout sidesteps
  // both: it's always the true available space, regardless of window
  // timing or Yoga's aspectRatio resolution order.
  const [calendarGridWidth, setCalendarGridWidth] = useState(0);
  const [statusRowWidth, setStatusRowWidth] = useState(0);
  const cellSize = calendarGridWidth ? Math.floor(calendarGridWidth / 7) : 0;
  const statusButtonWidth = statusRowWidth ? Math.floor((statusRowWidth - STATUS_GAP) / 2) : 0;
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => iso(new Date()));
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
  const update = async (status: AvailabilityStatus) => {
    if (selected < today) {
      return Alert.alert("Past date is locked", "Availability records for past dates are read-only and cannot be changed.");
    }
    if (!data.vendor?.id) return Alert.alert("Vendor profile required", "Connect a vendor profile before changing availability.");
    if (savingStatus) return;
    const previousStatus = savedStatuses[selected];
    setSavedStatuses((current) => {
      const next = { ...current };
      if (status === "available") delete next[selected];
      else next[selected] = status;
      return next;
    });
    setSavingStatus(status);
    let error: unknown = null;
    try {
      await setVendorAvailabilityException(data.vendor.id, selected, status);
    } catch (caught) {
      error = caught;
    }
    setSavingStatus(null);
    if (error) {
      setSavedStatuses((current) => {
        const next = { ...current };
        if (previousStatus) next[selected] = previousStatus;
        else delete next[selected];
        return next;
      });
      Alert.alert("Availability not saved", error instanceof Error ? error.message : "Please try again.");
      return;
    }
    void refresh();
    showSuccess(
      status === "available"
        ? bookingBlockedDates.has(selected)
          ? `${selected} still has a confirmed booking and remains blocked.`
          : `${selected} is available by default.`
        : `${selected} is now ${status}.`,
    );
  };
  return <View style={[styles.page, { backgroundColor: colors.background }]}>
    <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
    <ScrollView
      contentContainerStyle={[styles.content, { paddingBottom: 24 + Math.max(insets.bottom, 8) + VENDOR_TAB_BASE_HEIGHT + 16 }]}
      showsVerticalScrollIndicator={false}
      decelerationRate="fast"
    >
      <VendorDashboardReveal>
      <Text style={[styles.eyebrow, { color: colors.pink }]}>PLAN WITH CLARITY</Text>
      <Text style={[styles.title, { color: colors.text }]}>Availability</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Keep customer expectations accurate with an up-to-date working calendar.</Text>
      <View style={[styles.calendar, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
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
            const active = value === selected;
            const past = value < today;
            const palette = status ? statusColors[status] : null;
            const backgroundColor = past
              ? colorScheme === "dark" ? "#292C33" : "#E8E8EC"
              : palette?.background ?? (active ? colors.pink : "transparent");
            const dateColor = past
              ? colorScheme === "dark" ? "#747982" : "#9A9AA1"
              : palette?.text ?? (active ? "#FFFFFF" : colors.text);
            return <Pressable
              key={value}
              disabled={past}
              accessibilityLabel={`${date.toLocaleDateString()}${past ? ", past date, locked" : status ? `, ${status}` : ""}`}
              accessibilityState={{ disabled: past, selected: active }}
              onPress={() => setSelected(value)}
              style={({ pressed, hovered, focused }) => [
                styles.day,
                cellSize ? { width: cellSize, height: cellSize } : null,
                { backgroundColor },
                past && styles.pastDay,
                active && !past && {
                  borderWidth: 2,
                  borderColor: status === "tentative" ? "#6F5100" : "#FFFFFF",
                },
                !past && (hovered || focused) && styles.dayHover,
                !past && pressed && styles.dayPressed,
              ]}
            >
              <Text style={[styles.dayText, { color: dateColor }]}>{date.getDate()}</Text>
            </Pressable>;
          })}
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: statusColors.available.background }]} /><Text style={[styles.legendText, { color: colors.muted }]}>Available</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: statusColors.tentative.background }]} /><Text style={[styles.legendText, { color: colors.muted }]}>Tentative</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: statusColors.blocked.background }]} /><Text style={[styles.legendText, { color: colors.muted }]}>Blocked</Text></View>
          <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: colorScheme === "dark" ? "#292C33" : "#E8E8EC" }]} /><Text style={[styles.legendText, { color: colors.muted }]}>Past · locked</Text></View>
        </View>
      </View>
      <View style={[styles.editor, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
        <Text style={[styles.editorTitle, { color: colors.text }]}>{new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Future dates are available automatically. Add an exception only when needed.</Text>
        <View onLayout={(event) => setStatusRowWidth(event.nativeEvent.layout.width)} style={styles.statusGrid}>{statuses.map(({ id, label, icon: Icon }) => {
          const active = dateStatus(selected) === id;
          const palette = statusColors[id];
          return <Pressable key={id} accessibilityRole="radio" accessibilityLabel={`Set availability to ${label}`} accessibilityState={{ checked: active, disabled: savingStatus !== null || selected < today, busy: savingStatus === id }} disabled={savingStatus !== null || selected < today} onPress={() => update(id)} style={({ pressed, hovered, focused }) => [styles.status, statusButtonWidth ? { width: statusButtonWidth } : null, { backgroundColor: active ? palette.background : colors.background, borderColor: active ? palette.background : colors.border }, (hovered || focused) && styles.hoverLift, selected < today && styles.statusDisabled, pressed && styles.pressed]}>
            {savingStatus === id
              ? <ActivityIndicator size="small" color={active ? palette.text : colors.pink} />
              : <Icon size={19} color={active ? palette.text : colors.muted} />}
            <Text numberOfLines={1} style={{ flexShrink: 1, color: active ? palette.text : colors.text, fontSize: typeScale.metadata, fontWeight: "700" }}>{label}</Text>
          </Pressable>;
        })}</View>
        {selected >= today && savedStatuses[selected] ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove exception and mark date available"
            accessibilityState={{ disabled: savingStatus !== null, busy: savingStatus === "available" }}
            disabled={savingStatus !== null}
            onPress={() => update("available")}
            style={[styles.markAvailable, { borderColor: statusColors.available.background }]}
          >
            {savingStatus === "available"
              ? <ActivityIndicator size="small" color={statusColors.available.background} />
              : <CircleCheck size={18} color={statusColors.available.background} />}
            <Text style={[styles.markAvailableText, { color: statusColors.available.background }]}>Mark Available</Text>
          </Pressable>
        ) : null}
        {selected < today ? <View style={[styles.lockNotice, { backgroundColor: colors.surfaceSoft }]}>
          <LockKeyhole size={16} color={colors.muted} />
          <Text style={[styles.lockText, { color: colors.muted }]}>Past availability is read-only and cannot be changed.</Text>
        </View> : null}
      </View>

      <View style={[styles.editor, { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.shadow }]}>
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
      </VendorDashboardReveal>
    </ScrollView>
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
  eyebrow: { ...typeStyles.caption, letterSpacing: 1.1, marginBottom: 5 }, title: { ...typeStyles.pageTitle },
  subtitle: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.bodyCompact, marginTop: 4 }, calendar: { borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 20, shadowOffset: { width: 0, height: 8 }, shadowOpacity: .05, shadowRadius: 18, elevation: 2 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }, month: { fontSize: typeScale.cardTitle, fontWeight: "700" }, arrow: { width: interactionTokens.minimumTouchTarget, height: interactionTokens.minimumTouchTarget, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" }, weekday: { width: "14.285%", textAlign: "center", fontSize: typeScale.caption, fontWeight: "700", paddingVertical: 8 },
  day: { width: "14.285%", borderRadius: 12, alignItems: "center", justifyContent: "center", transform: [{ scale: .92 }] }, dayText: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.metadata, fontWeight: "700" }, pastDay: { opacity: .6 }, dayHover: { transform: [{ scale: .95 }] }, dayPressed: { transform: [{ scale: .89 }], opacity: .9 },
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 13, paddingTop: 16 }, legendItem: { flexDirection: "row", alignItems: "center", gap: 5 }, legendSwatch: { width: 10, height: 10, borderRadius: 3 }, legendText: { fontSize: typeScale.caption, fontWeight: "700" },
  editor: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 14, shadowOffset: { width: 0, height: 8 }, shadowOpacity: .045, shadowRadius: 16, elevation: 1 }, editorTitle: { fontSize: typeScale.cardTitle, fontWeight: "700" },
  statusGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 }, status: { flex: 1, minWidth: 120, minHeight: 68, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center", gap: 7 }, statusDisabled: { opacity: .45 }, hoverLift: { transform: [{ translateY: -1 }] }, pressed: { transform: [{ scale: .98 }], opacity: .9 },
  markAvailable: { minHeight: 48, borderWidth: 1, borderRadius: 14, marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7 },
  markAvailableText: { fontSize: typeScale.metadata, fontWeight: "700" },
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
  lockNotice: { minHeight: 44, borderRadius: 14, marginTop: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }, lockText: { flex: 1, fontSize: typeScale.caption, lineHeight: typeLeading.caption },
});
