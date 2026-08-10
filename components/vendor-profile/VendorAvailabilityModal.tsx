import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Clock3, LockKeyhole, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PublicVendorAvailability } from "@/services/publicVendorListings";
import { typeScale, typeLeading } from "@/constants/typography";
import { listEffectiveVendorAvailability } from "@/services/vendorAvailability";

type AvailabilityStatus = PublicVendorAvailability["status"];

type VendorAvailabilityModalProps = {
  visible: boolean;
  vendorId: string;
  vendorName: string;
  availability: PublicVendorAvailability[];
  dark?: boolean;
  onClose: () => void;
};

const statusMeta: Record<AvailabilityStatus, {
  label: string;
  detail: string;
  background: string;
  text: string;
}> = {
  available: {
    label: "Available",
    detail: "The vendor is available on this date.",
    background: "#16A34A",
    text: "#FFFFFF",
  },
  tentative: {
    label: "Tentative",
    detail: "Availability may change. Confirm directly with the vendor.",
    background: "#F4B400",
    text: "#3C2A00",
  },
  blocked: {
    label: "Blocked",
    detail: "The vendor is unavailable on this date.",
    background: "#E53935",
    text: "#FFFFFF",
  },
};

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

// Sheet sizing constants used to derive pixel-accurate layout from the
// actual device width. Android's Yoga layout engine can mis-resolve
// `aspectRatio` combined with percentage widths inside a `flexWrap`
// container (the calendar day grid), which balloons cell sizes on native
// Android while looking fine on web. Computing explicit pixel sizes from
// useWindowDimensions sidesteps that engine-specific bug and keeps the
// sheet responsive across screen sizes instead of just "smaller".
const SHEET_HORIZONTAL_MARGIN = 12;
const SHEET_MAX_WIDTH = 560;
const SHEET_HORIZONTAL_PADDING = 16;
const CALENDAR_PADDING = 13;

export default function VendorAvailabilityModal({
  visible,
  vendorId,
  vendorName,
  availability,
  dark = false,
  onClose,
}: VendorAvailabilityModalProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const sheetWidth = Math.min(windowWidth - SHEET_HORIZONTAL_MARGIN * 2, SHEET_MAX_WIDTH);
  const sheetMaxHeight = Math.max(320, Math.min(windowHeight * 0.92, windowHeight - insets.top - 24));
  const gridWidth = sheetWidth - SHEET_HORIZONTAL_PADDING * 2 - CALENDAR_PADDING * 2;
  const cellSize = Math.floor(gridWidth / 7);
  const today = iso(new Date());
  const currentMonth = startOfMonth(new Date());
  const [month, setMonth] = useState(currentMonth);
  const [selected, setSelected] = useState(today);
  const [effectiveStatuses, setEffectiveStatuses] = useState<Record<string, AvailabilityStatus>>({});
  const background = dark ? "#11151E" : "#FFFFFF";
  const surface = dark ? "#1A202C" : "#FFF8FB";
  const text = dark ? "#FFF8FB" : "#24171E";
  const muted = dark ? "#B9B0B5" : "#766970";
  const border = dark ? "#343B48" : "#EEDDE4";

  useEffect(() => {
    if (!visible) return;
    setMonth(startOfMonth(new Date()));
    setSelected(today);
  }, [visible, today]);

  useEffect(() => {
    if (!visible || !vendorId) return;
    let active = true;
    const firstDay = iso(month);
    const lastDay = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    listEffectiveVendorAvailability(vendorId, firstDay, lastDay)
      .then((rows) => {
        if (!active) return;
        setEffectiveStatuses((current) => {
          const next = { ...current };
          rows.forEach((row) => { next[row.date] = row.status; });
          return next;
        });
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [month, vendorId, visible]);

  const statusByDate = useMemo(() => ({
    ...Object.fromEntries(availability.map((item) => [item.date, item.status])),
    ...effectiveStatuses,
  }) as Record<string, AvailabilityStatus>, [availability, effectiveStatuses]);

  const days = useMemo(() => {
    const result: (Date | null)[] = Array(month.getDay()).fill(null);
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= count; day += 1) {
      result.push(new Date(month.getFullYear(), month.getMonth(), day));
    }
    while (result.length % 7) result.push(null);
    return result;
  }, [month]);

  const selectedStatus = selected < today ? undefined : statusByDate[selected] ?? "available";
  const selectedPast = selected < today;
  const canGoPrevious = month.getTime() > currentMonth.getTime();
  const visibleUpcoming = days.filter((date): date is Date => Boolean(date && iso(date) >= today));
  const availableCount = visibleUpcoming.filter((date) => (statusByDate[iso(date)] ?? "available") === "available").length;
  const tentativeCount = visibleUpcoming.filter((date) => statusByDate[iso(date)] === "tentative").length;
  const blockedCount = visibleUpcoming.filter((date) => statusByDate[iso(date)] === "blocked").length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, {
          width: sheetWidth,
          maxHeight: sheetMaxHeight,
          paddingBottom: Math.max(insets.bottom, 16) + 8,
          backgroundColor: background,
          shadowColor: dark ? "#000000" : "#7D3D58",
        }]}>
          <View style={[styles.handle, { backgroundColor: border }]} />
          <View style={styles.header}>
            <View style={[styles.headerIcon, { backgroundColor: dark ? "#30271B" : "#FFF3D8" }]}>
              <CalendarDays size={21} color="#B7791F" />
            </View>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>VENDOR CALENDAR</Text>
              <Text numberOfLines={1} style={[styles.title, { color: text }]}>{vendorName}</Text>
              <Text style={[styles.subtitle, { color: muted }]}>Read-only availability shared by the vendor.</Text>
            </View>
            <Pressable accessibilityLabel="Close vendor calendar" onPress={onClose} style={[styles.close, { backgroundColor: surface }]}>
              <X size={20} color={text} />
            </Pressable>
          </View>

          <View style={styles.summaryRow}>
            <View style={[styles.summaryPill, { backgroundColor: "#EAF8EF" }]}><Text style={styles.summaryValue}>{availableCount}</Text><Text style={styles.summaryGreen}>Available</Text></View>
            <View style={[styles.summaryPill, { backgroundColor: "#FFF5D6" }]}><Text style={styles.summaryValue}>{tentativeCount}</Text><Text style={styles.summaryYellow}>Tentative</Text></View>
            <View style={[styles.summaryPill, { backgroundColor: "#FDECEB" }]}><Text style={styles.summaryValue}>{blockedCount}</Text><Text style={styles.summaryRed}>Blocked</Text></View>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={[styles.calendar, { backgroundColor: surface }]}>
              <View style={styles.monthRow}>
                <Pressable
                  disabled={!canGoPrevious}
                  accessibilityLabel="Previous month"
                  onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                  style={[styles.arrow, !canGoPrevious && styles.disabled]}
                ><ChevronLeft size={20} color={text} /></Pressable>
                <Text style={[styles.month, { color: text }]}>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
                <Pressable
                  accessibilityLabel="Next month"
                  onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                  style={styles.arrow}
                ><ChevronRight size={20} color={text} /></Pressable>
              </View>

              <View style={styles.grid}>
                {["S", "M", "T", "W", "T", "F", "S"].map((day, index) =>
                  <Text key={`${day}-${index}`} style={[styles.weekday, { width: cellSize, color: muted }]}>{day}</Text>)}
                {days.map((date, index) => {
                  if (!date) return <View key={`blank-${index}`} style={[styles.day, { width: cellSize, height: cellSize }]} />;
                  const value = iso(date);
                  const past = value < today;
                  const status: AvailabilityStatus = past ? "blocked" : statusByDate[value] ?? "available";
                  const active = value === selected;
                  const meta = statusMeta[status];
                  const backgroundColor = past
                    ? dark ? "#272B33" : "#ECECEF"
                    : meta?.background ?? "transparent";
                  const dateColor = past
                    ? dark ? "#777C86" : "#A2A2A8"
                    : meta?.text ?? text;
                  return (
                    <Pressable
                      key={value}
                      accessibilityLabel={`${date.toLocaleDateString()}${past ? ", past date" : `, ${meta.label}`}`}
                      accessibilityState={{ selected: active }}
                      onPress={() => setSelected(value)}
                      style={[
                        styles.day,
                        { width: cellSize, height: cellSize, backgroundColor },
                        past && styles.pastDay,
                        active && { borderColor: "#E91E63", borderWidth: 2 },
                      ]}
                    >
                      <Text style={[styles.dayText, { color: dateColor }]}>{date.getDate()}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.legend}>
              <View style={styles.legendItem}><CircleCheck size={14} color="#16A34A" /><Text style={[styles.legendText, { color: muted }]}>Available</Text></View>
              <View style={styles.legendItem}><Clock3 size={14} color="#D99F00" /><Text style={[styles.legendText, { color: muted }]}>Tentative</Text></View>
              <View style={styles.legendItem}><LockKeyhole size={14} color="#E53935" /><Text style={[styles.legendText, { color: muted }]}>Blocked</Text></View>
            </View>

            <View style={[styles.selectedCard, { backgroundColor: surface }]}>
              <View style={[styles.selectedSwatch, {
                backgroundColor: selectedPast
                  ? dark ? "#30343D" : "#E5E5E9"
                  : selectedStatus ? statusMeta[selectedStatus].background : border,
              }]} />
              <View style={styles.flex}>
                <Text style={[styles.selectedDate, { color: text }]}>
                  {new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
                </Text>
                <Text style={[styles.selectedStatus, { color: muted }]}>
                  {selectedPast
                    ? "Past date"
                    : `${statusMeta[selectedStatus ?? "available"].label} · ${statusMeta[selectedStatus ?? "available"].detail}`}
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(17,8,13,.56)" },
  sheet: { alignSelf: "center", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: SHEET_HORIZONTAL_PADDING, paddingTop: 10, shadowOffset: { width: 0, height: -8 }, shadowOpacity: .16, shadowRadius: 28, elevation: 10 },
  scroll: { flexShrink: 1, flexGrow: 0 },
  scrollContent: { flexGrow: 1 },
  handle: { width: 38, height: 4, borderRadius: 999, alignSelf: "center", marginBottom: 18 },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 11, marginBottom: 18 },
  headerIcon: { width: 44, height: 44, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  flex: { flex: 1, minWidth: 0 },
  eyebrow: { color: "#E91E63", fontSize: typeScale.caption, lineHeight: typeLeading.caption, letterSpacing: 1.4, fontWeight: "700", marginBottom: 3 },
  title: { fontSize: typeScale.editorialCardTitle, lineHeight: typeLeading.sectionTitle, fontWeight: "700", letterSpacing: -.35 },
  subtitle: { fontSize: typeScale.caption, lineHeight: typeLeading.label, marginTop: 2 },
  close: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  summaryRow: { flexDirection: "row", gap: 7, marginBottom: 12 },
  summaryPill: { flex: 1, minHeight: 48, borderRadius: 15, paddingHorizontal: 9, alignItems: "center", justifyContent: "center" },
  summaryValue: { color: "#272027", fontSize: typeScale.body, lineHeight: typeLeading.bodyCompact, fontWeight: "700" },
  summaryGreen: { color: "#168342", fontSize: typeScale.caption, fontWeight: "700", marginTop: 2 },
  summaryYellow: { color: "#8A6500", fontSize: typeScale.caption, fontWeight: "700", marginTop: 2 },
  summaryRed: { color: "#C12C29", fontSize: typeScale.caption, fontWeight: "700", marginTop: 2 },
  calendar: { borderRadius: 22, padding: 13 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  month: { fontSize: typeScale.body, lineHeight: typeLeading.body, fontWeight: "700" },
  arrow: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: .28 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  weekday: { paddingVertical: 8, textAlign: "center", fontSize: typeScale.caption, fontWeight: "700" },
  day: { borderRadius: 11, alignItems: "center", justifyContent: "center", transform: [{ scale: .92 }] },
  dayText: { fontSize: typeScale.metadata, lineHeight: typeLeading.label, fontWeight: "700" },
  pastDay: { opacity: .64 },
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14, paddingVertical: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendText: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, fontWeight: "700" },
  selectedCard: { minHeight: 74, borderRadius: 18, padding: 12, flexDirection: "row", alignItems: "center", gap: 11, marginBottom: 8 },
  selectedSwatch: { width: 10, alignSelf: "stretch", borderRadius: 999 },
  selectedDate: { fontSize: typeScale.bodyCompact, lineHeight: typeLeading.tab, fontWeight: "700" },
  selectedStatus: { fontSize: typeScale.caption, lineHeight: typeLeading.caption, marginTop: 3 },
});
