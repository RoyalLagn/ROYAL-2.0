import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Sparkles,
  X,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Pressable from "@/components/InteropSafePressable";
import { brandPalette } from "@/constants/brandPalette";
import { calculateEventDays } from "@/lib/bookingCalculations";
import {
  listEffectiveVendorAvailability,
  type EffectiveAvailabilityDay,
} from "@/services/vendorAvailability";

const PINK = brandPalette.light.primary;

export type BookingCalendarModalProps = {
  visible: boolean;
  vendorId: string;
  vendorName?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  dark?: boolean;
  onClose: () => void;
  onConfirmDates: (selected: {
    startDate: string;
    endDate: string;
    totalDays: number;
  }) => void;
};

function toIsoString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDateLabel(iso: string): string {
  if (!iso) return "—";
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function addDaysToIso(baseIso: string, daysToAdd: number): string {
  try {
    const [y, m, d] = baseIso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + daysToAdd);
    return toIsoString(dt);
  } catch {
    return baseIso;
  }
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function BookingCalendarModal({
  visible,
  vendorId,
  vendorName,
  initialStartDate,
  initialEndDate,
  dark = false,
  onClose,
  onConfirmDates,
}: BookingCalendarModalProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();

  const todayIso = useMemo(() => toIsoString(new Date()), []);

  // Calendar month viewing state
  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(() => {
    if (initialStartDate) {
      const [y, m] = initialStartDate.split("-").map(Number);
      return new Date(y, m - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  // Selected date range state
  const [tempStart, setTempStart] = useState<string>(() => {
    if (initialStartDate && initialStartDate >= todayIso) return initialStartDate;
    return addDaysToIso(todayIso, 7);
  });
  const [tempEnd, setTempEnd] = useState<string>(() => {
    if (initialEndDate && initialEndDate >= (initialStartDate || todayIso)) return initialEndDate;
    return addDaysToIso(todayIso, 7);
  });

  // Availability cache for loaded months: date string -> status info
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, EffectiveAvailabilityDay>>({});
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [warningMessage, setWarningMessage] = useState("");

  const palette = useMemo(
    () => ({
      surface: dark ? "#141B28" : "#FFFFFF",
      surfaceSoft: dark ? "#1E2738" : "#FFF7FA",
      surfaceHighlight: dark ? "#2B1A24" : "#FEEFF4",
      border: dark ? "#2A3548" : "#F2DDE5",
      text: dark ? "#F8F4F6" : "#1B1317",
      muted: dark ? "#AFA4AA" : "#6E6268",
      primary: PINK,
      blockedBg: dark ? "#451A22" : "#FEE2E2",
      blockedText: dark ? "#F87171" : "#DC2626",
      availBg: dark ? "#064E3B" : "#ECFDF5",
      availText: dark ? "#34D399" : "#059669",
      tentativeBg: dark ? "#452A10" : "#FEF3C7",
      tentativeText: dark ? "#FBBF24" : "#D97706",
    }),
    [dark]
  );

  // Sync initial state on modal open
  useEffect(() => {
    if (visible) {
      const start = initialStartDate && initialStartDate >= todayIso
        ? initialStartDate
        : addDaysToIso(todayIso, 7);
      const end = initialEndDate && initialEndDate >= start
        ? initialEndDate
        : start;
      setTempStart(start);
      setTempEnd(end);
      const [y, m] = start.split("-").map(Number);
      setCurrentMonthDate(new Date(y, m - 1, 1));
      setWarningMessage("");
    }
  }, [visible, initialStartDate, initialEndDate, todayIso]);

  // Load effective vendor availability for the visible month
  useEffect(() => {
    if (!visible || !vendorId) return;

    const y = currentMonthDate.getFullYear();
    const m = currentMonthDate.getMonth();
    const firstDayIso = toIsoString(new Date(y, m, 1));
    const lastDayIso = toIsoString(new Date(y, m + 1, 0));

    let active = true;
    setLoadingAvail(true);

    listEffectiveVendorAvailability(vendorId, firstDayIso, lastDayIso)
      .then((rows) => {
        if (!active) return;
        setAvailabilityMap((prev) => {
          const next = { ...prev };
          rows.forEach((r) => {
            next[r.date] = r;
          });
          return next;
        });
      })
      .catch((err) => {
        console.warn("Could not fetch calendar availability:", err);
      })
      .finally(() => {
        if (active) setLoadingAvail(false);
      });

    return () => {
      active = false;
    };
  }, [visible, vendorId, currentMonthDate]);

  // Calendar month days calculation
  const calendarDays = useMemo(() => {
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: (string | null)[] = [];
    // Padding before day 1
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push(null);
    }
    // Days of the month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(toIsoString(new Date(year, month, d)));
    }
    // Padding to complete last row of 7
    while (cells.length % 7 !== 0) {
      cells.push(null);
    }
    return cells;
  }, [currentMonthDate]);

  // Range calculations
  const totalSelectedDays = useMemo(() => {
    if (!tempStart) return 1;
    return calculateEventDays(tempStart, tempEnd || tempStart);
  }, [tempStart, tempEnd]);

  // Check if any date in the selected range is blocked
  useEffect(() => {
    if (!tempStart) return;
    const end = tempEnd || tempStart;
    const days = calculateEventDays(tempStart, end);
    let hasBlocked = false;

    for (let i = 0; i < days; i++) {
      const curIso = addDaysToIso(tempStart, i);
      const info = availabilityMap[curIso];
      if (info?.bookingBlocked || info?.status === "blocked") {
        hasBlocked = true;
        break;
      }
    }

    if (hasBlocked) {
      setWarningMessage("One or more dates in your selected range are already booked/blocked by this vendor.");
    } else {
      setWarningMessage("");
    }
  }, [tempStart, tempEnd, availabilityMap]);

  // Month navigation
  const realCurrentMonth = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, []);

  const canGoPrevMonth = currentMonthDate.getTime() > realCurrentMonth.getTime();

  const handlePrevMonth = () => {
    if (!canGoPrevMonth) return;
    setCurrentMonthDate(
      (curr) => new Date(curr.getFullYear(), curr.getMonth() - 1, 1)
    );
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(
      (curr) => new Date(curr.getFullYear(), curr.getMonth() + 1, 1)
    );
  };

  // Day tap selection handler
  const handleDayPress = (dayIso: string) => {
    if (dayIso < todayIso) {
      Alert.alert("Past Date", "Please choose a future date for your event.");
      return;
    }

    const dayInfo = availabilityMap[dayIso];
    if (dayInfo?.bookingBlocked || dayInfo?.status === "blocked") {
      Alert.alert(
        "Date Unavailable",
        `The vendor is already booked on ${formatDateLabel(dayIso)}. Please select an available date.`
      );
      return;
    }

    // Selection flow:
    // 1. If currently no start, or if a complete range is already selected: start fresh with tapped date
    if (!tempStart || (tempStart && tempEnd && tempStart !== tempEnd)) {
      setTempStart(dayIso);
      setTempEnd(dayIso);
    } else {
      // 2. We have a single start date chosen
      if (dayIso > tempStart) {
        setTempEnd(dayIso);
      } else if (dayIso === tempStart) {
        // Tap same date: 1 day event
        setTempEnd(dayIso);
      } else {
        // Tapped earlier date: make this the new start
        setTempStart(dayIso);
        setTempEnd(dayIso);
      }
    }
  };

  // Quick preset duration buttons (1 Day, 2 Days, 3 Days, 4 Days, 5 Days)
  const applyPresetDays = (daysCount: number) => {
    const base = tempStart || addDaysToIso(todayIso, 7);
    const newEnd = addDaysToIso(base, Math.max(0, daysCount - 1));
    setTempStart(base);
    setTempEnd(newEnd);
  };

  const handleConfirm = () => {
    if (!tempStart) return;
    const finalEnd = tempEnd || tempStart;
    const days = calculateEventDays(tempStart, finalEnd);

    if (warningMessage) {
      Alert.alert(
        "Blocked Date in Selection",
        "Your chosen date range includes a booked date. Do you want to adjust your dates?",
        [
          { text: "Adjust Dates", style: "cancel" },
          {
            text: "Proceed Anyway",
            onPress: () => {
              onConfirmDates({
                startDate: tempStart,
                endDate: finalEnd,
                totalDays: days,
              });
              onClose();
            },
          },
        ]
      );
      return;
    }

    onConfirmDates({
      startDate: tempStart,
      endDate: finalEnd,
      totalDays: days,
    });
    onClose();
  };

  if (!visible) return null;

  const modalWidth = Math.min(windowWidth - 24, 480);
  const horizontalPadding = 16;
  const gridWidth = modalWidth - horizontalPadding * 2;
  const cellSize = Math.floor(gridWidth / 7);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.modalContainer,
            {
              width: modalWidth,
              backgroundColor: palette.surface,
              borderColor: palette.border,
              paddingBottom: Math.max(insets.bottom, 16) + 4,
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.modalHeader, { borderBottomColor: palette.border }]}>
            <View style={[styles.headerIconWrap, { backgroundColor: palette.surfaceHighlight }]}>
              <CalendarDays size={20} color={PINK} strokeWidth={2.2} />
            </View>
            <View style={styles.headerTitles}>
              <Text style={[styles.modalTitle, { color: palette.text }]}>Select Event Dates</Text>
              <Text numberOfLines={1} style={[styles.modalSubtitle, { color: palette.muted }]}>
                {vendorName ? `${vendorName} · ` : ""}Tap start & end dates on the calendar
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close date selector"
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: palette.surfaceSoft }]}
            >
              <X size={18} color={palette.text} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
            {/* Range Displayer Banner */}
            <View style={[styles.rangeDisplayBanner, { backgroundColor: palette.surfaceSoft, borderColor: palette.border }]}>
              <View style={styles.rangeInfoCol}>
                <Text style={[styles.rangeLabel, { color: palette.muted }]}>SELECTED EVENT DATES</Text>
                <Text style={[styles.rangeDatesText, { color: palette.text }]}>
                  {formatDateLabel(tempStart)}
                  {tempEnd && tempEnd !== tempStart ? ` → ${formatDateLabel(tempEnd)}` : ""}
                </Text>
              </View>

              <View style={[styles.durationBadge, { backgroundColor: palette.surfaceHighlight, borderColor: PINK }]}>
                <Sparkles size={13} color={PINK} style={{ marginRight: 4 }} />
                <Text style={[styles.durationBadgeText, { color: PINK }]}>
                  {totalSelectedDays} {totalSelectedDays === 1 ? "Day Event" : "Days Event"}
                </Text>
              </View>
            </View>

            {/* Quick Duration Preset Chips */}
            <View style={styles.presetSection}>
              <Text style={[styles.presetSectionTitle, { color: palette.muted }]}>QUICK DURATION PRESETS:</Text>
              <View style={styles.presetChipsRow}>
                {[1, 2, 3, 4, 5].map((d) => {
                  const isSelected = totalSelectedDays === d;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => applyPresetDays(d)}
                      style={[
                        styles.presetChip,
                        {
                          backgroundColor: isSelected ? PINK : palette.surfaceSoft,
                          borderColor: isSelected ? PINK : palette.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.presetChipText,
                          { color: isSelected ? "#FFFFFF" : palette.text },
                        ]}
                      >
                        {d} {d === 1 ? "Day" : "Days"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Month Navigator Bar */}
            <View style={[styles.monthNavBar, { backgroundColor: palette.surfaceSoft }]}>
              <Pressable
                accessibilityLabel="Previous month"
                disabled={!canGoPrevMonth}
                onPress={handlePrevMonth}
                style={[styles.monthNavBtn, !canGoPrevMonth && styles.monthNavBtnDisabled]}
              >
                <ChevronLeft size={20} color={canGoPrevMonth ? palette.text : palette.muted} />
              </Pressable>

              <View style={styles.monthTitleGroup}>
                <Text style={[styles.monthTitleText, { color: palette.text }]}>
                  {currentMonthDate.toLocaleDateString("en-IN", {
                    month: "long",
                    year: "numeric",
                  })}
                </Text>
                {loadingAvail ? (
                  <ActivityIndicator size="small" color={PINK} style={{ marginLeft: 8 }} />
                ) : null}
                {canGoPrevMonth ? (
                  <Pressable
                    accessibilityLabel="Jump to current month"
                    onPress={() => setCurrentMonthDate(new Date(realCurrentMonth))}
                    style={[styles.todayJumpBtn, { backgroundColor: palette.surfaceHighlight, borderColor: PINK }]}
                  >
                    <Text style={[styles.todayJumpText, { color: PINK }]}>Today</Text>
                  </Pressable>
                ) : null}
              </View>

              <Pressable
                accessibilityLabel="Next month"
                onPress={handleNextMonth}
                style={styles.monthNavBtn}
              >
                <ChevronRight size={20} color={palette.text} />
              </Pressable>
            </View>

            {/* Availability Color Legend */}
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#10B981" }]} />
                <Text style={[styles.legendText, { color: palette.muted }]}>Available</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#EF4444" }]} />
                <Text style={[styles.legendText, { color: palette.muted }]}>Booked</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: PINK }]} />
                <Text style={[styles.legendText, { color: palette.muted }]}>Your Selection</Text>
              </View>
            </View>

            {/* Weekday Headers */}
            <View style={[styles.weekdayRow, { width: cellSize * 7 }]}>
              {WEEKDAY_NAMES.map((name, idx) => (
                <View key={name} style={[styles.weekdayCol, { width: cellSize }]}>
                  <Text
                    style={[
                      styles.weekdayText,
                      { color: idx === 0 ? "#EF4444" : palette.muted },
                    ]}
                  >
                    {name}
                  </Text>
                </View>
              ))}
            </View>

            {/* Calendar Days 7-Col Grid */}
            <View style={[styles.gridContainer, { width: cellSize * 7 }]}>
              {calendarDays.map((dayIso, index) => {
                if (!dayIso) {
                  return (
                    <View
                      key={`empty_${index}`}
                      style={[styles.dayCellEmpty, { width: cellSize, height: cellSize }]}
                    />
                  );
                }

                const dayNum = parseInt(dayIso.slice(8, 10), 10);
                const isPast = dayIso < todayIso;
                const avail = availabilityMap[dayIso];
                const isBlocked = !isPast && (avail?.bookingBlocked || avail?.status === "blocked");
                const isTentative = !isPast && avail?.status === "tentative";

                const isStart = tempStart === dayIso;
                const isEnd = tempEnd === dayIso;
                const isInRange = Boolean(
                  tempStart &&
                  tempEnd &&
                  dayIso >= tempStart &&
                  dayIso <= tempEnd
                );
                const isSingleSelected = isStart && (tempEnd === tempStart || !tempEnd);

                // Styling determination
                let cellBg = "transparent";
                let textColor = palette.text;
                let textFontWeight: "normal" | "600" | "700" = "normal";

                if (isPast) {
                  textColor = dark ? "#4B5563" : "#D1D5DB";
                } else if (isStart || isEnd) {
                  cellBg = PINK;
                  textColor = "#FFFFFF";
                  textFontWeight = "700";
                } else if (isInRange) {
                  cellBg = palette.surfaceHighlight;
                  textColor = PINK;
                  textFontWeight = "600";
                } else if (isBlocked) {
                  cellBg = dark ? "#2A181C" : "#FEE2E2";
                  textColor = dark ? "#F87171" : "#DC2626";
                }

                return (
                  <View
                    key={dayIso}
                    style={[styles.dayCellWrapper, { width: cellSize, height: cellSize }]}
                  >
                    <Pressable
                      disabled={isPast}
                      onPress={() => handleDayPress(dayIso)}
                      style={[
                        styles.dayCellBtn,
                        { backgroundColor: cellBg },
                        isSingleSelected && styles.dayCellCircle,
                        isStart && !isSingleSelected && styles.dayCellStart,
                        isEnd && !isSingleSelected && styles.dayCellEnd,
                        isInRange && !isStart && !isEnd && styles.dayCellMiddle,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNumberText,
                          {
                            color: textColor,
                            fontWeight: textFontWeight,
                            textDecorationLine: isBlocked && !isInRange ? "line-through" : "none",
                          },
                        ]}
                      >
                        {dayNum}
                      </Text>

                      {/* Status indicator dot below date */}
                      {!isInRange && !isPast ? (
                        <View style={styles.statusDotRow}>
                          {isBlocked ? (
                            <View style={[styles.dayStatusDot, { backgroundColor: "#EF4444" }]} />
                          ) : isTentative ? (
                            <View style={[styles.dayStatusDot, { backgroundColor: "#F59E0B" }]} />
                          ) : (
                            <View style={[styles.dayStatusDot, { backgroundColor: "#10B981" }]} />
                          )}
                        </View>
                      ) : null}
                    </Pressable>
                  </View>
                );
              })}
            </View>

            {/* Warning Message if blocked date in selection */}
            {warningMessage ? (
              <View style={[styles.warningBox, { backgroundColor: dark ? "#3C1F1F" : "#FEF2F2", borderColor: "#EF4444" }]}>
                <CircleAlert size={16} color="#DC2626" style={{ marginRight: 6 }} />
                <Text style={[styles.warningText, { color: dark ? "#FCA5A5" : "#991B1B" }]}>
                  {warningMessage}
                </Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer Action */}
          <View style={[styles.footer, { borderTopColor: palette.border }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirm dates"
              onPress={handleConfirm}
              style={[styles.confirmBtn, { backgroundColor: PINK }]}
            >
              <CircleCheck size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
              <Text style={styles.confirmBtnText}>
                Confirm Dates ({totalSelectedDays} {totalSelectedDays === 1 ? "Day" : "Days"})
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(10, 6, 8, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
  },
  modalContainer: {
    borderRadius: 22,
    borderWidth: 1,
    maxHeight: "92%",
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 12px 40px rgba(0, 0, 0, 0.28)" },
      default: { elevation: 6 },
    }),
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  headerTitles: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  rangeDisplayBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  rangeInfoCol: {
    flex: 1,
  },
  rangeLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  rangeDatesText: {
    fontSize: 15,
    fontWeight: "700",
  },
  durationBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  durationBadgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  presetSection: {
    marginBottom: 14,
  },
  presetSectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  presetChipsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: "600",
  },
  monthNavBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 10,
  },
  monthNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  monthNavBtnDisabled: {
    opacity: 0.35,
  },
  monthTitleGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  monthTitleText: {
    fontSize: 16,
    fontWeight: "700",
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: "500",
  },
  weekdayRow: {
    flexDirection: "row",
    marginBottom: 6,
    alignSelf: "center",
  },
  weekdayCol: {
    alignItems: "center",
    paddingVertical: 4,
  },
  weekdayText: {
    fontSize: 11,
    fontWeight: "700",
  },
  gridContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignSelf: "center",
  },
  dayCellWrapper: {
    padding: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dayCellEmpty: {},
  todayJumpBtn: {
    marginLeft: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  todayJumpText: {
    fontSize: 11,
    fontWeight: "700",
  },
  dayCellBtn: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  dayCellCircle: {
    borderRadius: 999,
  },
  dayCellStart: {
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  dayCellEnd: {
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  dayCellMiddle: {
    borderRadius: 4,
  },
  dayNumberText: {
    fontSize: 13,
  },
  statusDotRow: {
    marginTop: 2,
    height: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  dayStatusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  confirmBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: 14,
  },
  confirmBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
});
