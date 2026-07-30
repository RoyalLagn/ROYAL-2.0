import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight, CircleCheck, Clock3, LockKeyhole } from "lucide-react-native";
import VendorHeader from "@/components/vendor/VendorHeader";
import { useAppTheme } from "@/components/ThemeProvider";
import { vendorTheme } from "@/components/vendor/VendorTheme";
import { useVendorWorkspace } from "@/hooks/useVendorWorkspace";
import { supabase } from "@/services/supabase";

const statuses = [
  { id: "available", label: "Available", icon: CircleCheck },
  { id: "tentative", label: "Tentative", icon: Clock3 },
  { id: "blocked", label: "Blocked", icon: LockKeyhole },
] as const;
type AvailabilityStatus = (typeof statuses)[number]["id"];
const statusColors: Record<AvailabilityStatus, { background: string; text: string }> = {
  available: { background: "#16A34A", text: "#FFFFFF" },
  tentative: { background: "#F4B400", text: "#3C2A00" },
  blocked: { background: "#E53935", text: "#FFFFFF" },
};
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function VendorCalendar() {
  const { colorScheme } = useAppTheme();
  const colors = vendorTheme[colorScheme];
  const { data, refresh } = useVendorWorkspace();
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selected, setSelected] = useState(() => iso(new Date()));
  const [savedStatuses, setSavedStatuses] = useState<Record<string, AvailabilityStatus>>({});
  const [savingStatus, setSavingStatus] = useState<AvailabilityStatus | null>(null);
  const today = iso(new Date());
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
        if (item.date) next[item.date] = item.status;
      });
      return next;
    });
  }, [data.availability]);

  useEffect(() => {
    if (!data.vendor?.id) return;
    const firstDay = iso(month);
    const lastDay = iso(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    let active = true;
    supabase
      .from("vendor_availability")
      .select("date,status")
      .eq("vendor_id", data.vendor.id)
      .gte("date", firstDay)
      .lte("date", lastDay)
      .then(({ data: rows, error }) => {
        if (!active) return;
        if (error) {
          Alert.alert("Availability not loaded", error.message);
          return;
        }
        setSavedStatuses((current) => {
          const next = { ...current };
          Object.keys(next).forEach((date) => {
            if (date >= firstDay && date <= lastDay) delete next[date];
          });
          rows?.forEach((row) => { next[row.date] = row.status as AvailabilityStatus; });
          return next;
        });
      });
    return () => { active = false; };
  }, [data.vendor?.id, month]);

  const dateStatus = (date: string) => savedStatuses[date];
  const update = async (status: AvailabilityStatus) => {
    if (selected < today) {
      return Alert.alert("Past date is locked", "Availability records for past dates are read-only and cannot be changed.");
    }
    if (!data.vendor?.id) return Alert.alert("Vendor profile required", "Connect a vendor profile before changing availability.");
    if (savingStatus) return;
    const previousStatus = savedStatuses[selected];
    setSavedStatuses((current) => ({ ...current, [selected]: status }));
    setSavingStatus(status);
    const { error } = await supabase
      .from("vendor_availability")
      .upsert(
        { vendor_id: data.vendor.id, date: selected, status },
        { onConflict: "vendor_id,date" },
      );
    setSavingStatus(null);
    if (error) {
      setSavedStatuses((current) => {
        const next = { ...current };
        if (previousStatus) next[selected] = previousStatus;
        else delete next[selected];
        return next;
      });
      Alert.alert("Availability not saved", error.message);
      return;
    }
    void refresh();
    Alert.alert("Availability saved", `${selected} is now ${status}.`);
  };
  return <View style={[styles.page, { backgroundColor: colors.background }]}>
    <VendorHeader unread={data.notifications.filter((item) => !item.is_read).length} />
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.eyebrow, { color: colors.pink }]}>PLAN WITH CLARITY</Text>
      <Text style={[styles.title, { color: colors.text }]}>Availability</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Keep customer expectations accurate with an up-to-date working calendar.</Text>
      <View style={[styles.calendar, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
        <View style={styles.monthRow}><Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} style={styles.arrow}><ChevronLeft size={20} color={colors.text} /></Pressable><Text style={[styles.month, { color: colors.text }]}>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text><Pressable onPress={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} style={styles.arrow}><ChevronRight size={20} color={colors.text} /></Pressable></View>
        <View style={styles.grid}>{["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <Text key={`${day}${index}`} style={[styles.weekday, { color: colors.muted }]}>{day}</Text>)}
          {days.map((date, index) => {
            if (!date) return <View key={`blank${index}`} style={styles.day} />;
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
              style={[
                styles.day,
                { backgroundColor },
                past && styles.pastDay,
                active && !past && {
                  borderWidth: 2,
                  borderColor: status === "tentative" ? "#6F5100" : "#FFFFFF",
                },
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
      <View style={[styles.editor, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
        <Text style={[styles.editorTitle, { color: colors.text }]}>{new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Choose how this date appears in your vendor schedule.</Text>
        <View style={styles.statusGrid}>{statuses.map(({ id, label, icon: Icon }) => {
          const active = dateStatus(selected) === id;
          const palette = statusColors[id];
          return <Pressable key={id} disabled={savingStatus !== null || selected < today} onPress={() => update(id)} style={({ pressed }) => [styles.status, { backgroundColor: active ? palette.background : colors.background }, selected < today && styles.statusDisabled, pressed && styles.pressed]}>
            {savingStatus === id
              ? <ActivityIndicator size="small" color={active ? palette.text : colors.pink} />
              : <Icon size={19} color={active ? palette.text : colors.muted} />}
            <Text style={{ color: active ? palette.text : colors.text, fontSize: 11, fontWeight: "800" }}>{label}</Text>
          </Pressable>;
        })}</View>
        {selected < today ? <View style={[styles.lockNotice, { backgroundColor: colors.surfaceSoft }]}>
          <LockKeyhole size={16} color={colors.muted} />
          <Text style={[styles.lockText, { color: colors.muted }]}>Past availability is read-only and cannot be changed.</Text>
        </View> : null}
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1 }, content: { padding: 16, paddingTop: 22, paddingBottom: 24, width: "100%", maxWidth: 780, alignSelf: "center" },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: "800", marginBottom: 5 }, title: { fontSize: 29, fontWeight: "800", letterSpacing: -0.8 },
  subtitle: { fontSize: 12, lineHeight: 18, marginTop: 4 }, calendar: { borderRadius: 24, padding: 15, marginTop: 20, shadowOffset: { width: 0, height: 9 }, shadowOpacity: .08, shadowRadius: 22, elevation: 3 },
  monthRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }, month: { fontSize: 16, fontWeight: "800" }, arrow: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" }, weekday: { width: "14.285%", textAlign: "center", fontSize: 10, fontWeight: "800", paddingVertical: 8 },
  day: { width: "14.285%", aspectRatio: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", transform: [{ scale: .92 }] }, dayText: { fontSize: 12, lineHeight: 16, fontWeight: "800" }, pastDay: { opacity: .6 },
  legend: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 13, paddingTop: 16 }, legendItem: { flexDirection: "row", alignItems: "center", gap: 5 }, legendSwatch: { width: 10, height: 10, borderRadius: 3 }, legendText: { fontSize: 9, fontWeight: "700" },
  editor: { borderRadius: 22, padding: 16, marginTop: 14, shadowOffset: { width: 0, height: 8 }, shadowOpacity: .07, shadowRadius: 18, elevation: 2 }, editorTitle: { fontSize: 16, fontWeight: "800" },
  statusGrid: { flexDirection: "row", gap: 8, marginTop: 16 }, status: { flex: 1, minHeight: 68, borderRadius: 16, alignItems: "center", justifyContent: "center", gap: 7 }, statusDisabled: { opacity: .45 }, pressed: { transform: [{ scale: .98 }], opacity: .9 },
  lockNotice: { minHeight: 44, borderRadius: 14, marginTop: 12, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8 }, lockText: { flex: 1, fontSize: 10, lineHeight: 14 },
});
