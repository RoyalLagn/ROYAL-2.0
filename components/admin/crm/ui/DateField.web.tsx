import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react-native";
import type { DateFieldProps } from "./DateField";
import { adminLightTheme } from "@/theme";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 101 }, (_, index) => CURRENT_YEAR + 20 - index);

function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

function todayParts() {
  const date = new Date();
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function DateField({ label, value, onChange, placeholder = "Select a date", displayValue, hideLabel = false, minimumDate, maximumDate }: DateFieldProps) {
  const initial = dateParts(value) ?? todayParts();
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState({ year: initial.year, month: initial.month });
  const [headerPicker, setHeaderPicker] = useState<"month" | "year" | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });

  const syncPosition = useCallback(() => {
    const bounds = triggerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = 304;
    const estimatedHeight = 420;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, bounds.right - width));
    const below = bounds.bottom + 8;
    const top = below + estimatedHeight <= window.innerHeight
      ? below
      : Math.max(8, bounds.top - estimatedHeight - 8);
    setPosition({ left, top });
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (headerPicker) setHeaderPicker(null);
      else setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [headerPicker, open, syncPosition]);

  const toggle = () => {
    if (!open) {
      const selected = dateParts(value) ?? todayParts();
      setVisibleMonth({ year: selected.year, month: selected.month });
      syncPosition();
    }
    setHeaderPicker(null);
    setOpen((current) => !current);
  };

  const moveMonth = (delta: number) => {
    setHeaderPicker(null);
    setVisibleMonth((current) => {
      const index = current.year * 12 + current.month + delta;
      return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 };
    });
  };

  const firstDay = (new Date(visibleMonth.year, visibleMonth.month, 1).getDay() + 6) % 7;
  const dayCount = new Date(visibleMonth.year, visibleMonth.month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDay }, () => null),
    ...Array.from({ length: dayCount }, (_, index) => index + 1),
  ];
  while (cells.length % 7) cells.push(null);

  const chooseToday = () => {
    const today = todayParts();
    const next = dateKey(today.year, today.month, today.day);
    if ((!minimumDate || next >= minimumDate) && (!maximumDate || next <= maximumDate)) onChange(next);
    setOpen(false);
  };

  const currentToday = todayParts();

  return (
    <View className={hideLabel ? "relative mb-0" : "relative mb-3"} style={{ zIndex: open ? 40 : 1 }}>
      {!hideLabel ? <Text className="text-foreground text-xs font-semibold mb-1.5">{label}</Text> : null}
      <Pressable
        ref={triggerRef as never}
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${displayValue || value || placeholder}`}
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        className={`h-12 border rounded-2xl px-4 flex-row items-center justify-between bg-card ${open ? "border-primary" : "border-border"}`}
        style={({ pressed }) => pressed ? { transform: [{ scale: 0.98 }] } : undefined}
      >
        <Text className={value ? "text-foreground text-sm" : "text-muted-foreground text-sm"}>{displayValue || value || placeholder}</Text>
        <View className="w-8 h-8 rounded-xl bg-primary/10 items-center justify-center">
          <Calendar size={16} className="text-primary" />
        </View>
      </Pressable>

      {open ? createPortal(
        <View
          accessibilityLabel={`${label} calendar`}
          className="fixed w-[304px] rounded-2xl border border-border bg-card p-3"
          style={[adminLightTheme, { left: position.left, top: position.top, zIndex: 2147483647, boxShadow: "0 16px 40px rgba(2, 29, 70, 0.16)" }]}
        >
          <View className="h-10 flex-row items-center justify-between mb-2">
            <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => moveMonth(-1)} className="w-10 h-10 rounded-xl items-center justify-center bg-background">
              <ChevronLeft size={17} className="text-foreground" />
            </Pressable>
            <View className="flex-row items-center gap-1">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Choose month, currently ${MONTHS[visibleMonth.month]}`}
                accessibilityState={{ expanded: headerPicker === "month" }}
                onPress={() => setHeaderPicker((current) => current === "month" ? null : "month")}
                className={headerPicker === "month" ? "h-10 px-2.5 rounded-xl bg-primary/10 flex-row items-center gap-1" : "h-10 px-2.5 rounded-xl flex-row items-center gap-1"}
              >
                <Text className="text-foreground text-sm font-bold">{MONTHS[visibleMonth.month]}</Text>
                <ChevronDown size={13} className="text-primary" />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Choose year, currently ${visibleMonth.year}`}
                accessibilityState={{ expanded: headerPicker === "year" }}
                onPress={() => setHeaderPicker((current) => current === "year" ? null : "year")}
                className={headerPicker === "year" ? "h-10 px-2 rounded-xl bg-primary/10 flex-row items-center gap-1" : "h-10 px-2 rounded-xl flex-row items-center gap-1"}
              >
                <Text className="text-foreground text-sm font-bold">{visibleMonth.year}</Text>
                <ChevronDown size={13} className="text-primary" />
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => moveMonth(1)} className="w-10 h-10 rounded-xl items-center justify-center bg-background">
              <ChevronRight size={17} className="text-foreground" />
            </Pressable>
          </View>

          {headerPicker === "month" ? (
            <View className="absolute left-3 right-3 top-[62px] z-10 rounded-xl bg-card p-2 flex-row flex-wrap" style={{ boxShadow: "0 10px 28px rgba(2, 29, 70, 0.14)" }}>
              {MONTHS.map((month, index) => (
                <View key={month} className="w-1/3 p-1">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${month}`}
                    accessibilityState={{ selected: visibleMonth.month === index }}
                    onPress={() => { setVisibleMonth((current) => ({ ...current, month: index })); setHeaderPicker(null); }}
                    className={visibleMonth.month === index ? "h-10 rounded-xl bg-primary items-center justify-center" : "h-10 rounded-xl bg-background items-center justify-center"}
                  >
                    <Text className={visibleMonth.month === index ? "text-white text-xs font-bold" : "text-foreground text-xs font-semibold"}>{month.slice(0, 3)}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}

          {headerPicker === "year" ? (
            <ScrollView
              className="absolute right-11 top-[62px] z-10 w-24 h-52 rounded-xl bg-card p-1"
              style={{ boxShadow: "0 10px 28px rgba(2, 29, 70, 0.14)" }}
              showsVerticalScrollIndicator={false}
            >
              {YEARS.map((year) => (
                <Pressable
                  key={year}
                  accessibilityRole="button"
                  accessibilityLabel={`Select year ${year}`}
                  accessibilityState={{ selected: visibleMonth.year === year }}
                  onPress={() => { setVisibleMonth((current) => ({ ...current, year })); setHeaderPicker(null); }}
                  className={visibleMonth.year === year ? "h-10 rounded-xl bg-primary items-center justify-center mb-1" : "h-10 rounded-xl items-center justify-center mb-1"}
                >
                  <Text className={visibleMonth.year === year ? "text-white text-xs font-bold" : "text-foreground text-xs font-semibold"}>{year}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <View className="flex-row mb-1">
            {WEEKDAYS.map((weekday) => (
              <View key={weekday} className="w-10 h-7 items-center justify-center">
                <Text className="text-muted-foreground text-caption font-semibold" style={{ letterSpacing: 0.4 }}>{weekday}</Text>
              </View>
            ))}
          </View>

          <View className="flex-row flex-wrap">
            {cells.map((day, index) => {
              if (!day) return <View key={`blank-${index}`} className="w-10 h-10" />;
              const key = dateKey(visibleMonth.year, visibleMonth.month, day);
              const selected = key === value;
              const disabled = Boolean((minimumDate && key < minimumDate) || (maximumDate && key > maximumDate));
              const today = currentToday.year === visibleMonth.year && currentToday.month === visibleMonth.month && currentToday.day === day;
              return (
                <View key={key} className="w-10 h-10 p-0.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={key}
                    accessibilityState={{ selected, disabled }}
                    disabled={disabled}
                    onPress={() => { onChange(key); setOpen(false); }}
                    className={`flex-1 rounded-xl items-center justify-center ${selected ? "bg-primary" : today ? "bg-primary/10" : "bg-transparent"}`}
                  >
                    <Text className={selected ? "text-white text-xs font-bold" : disabled ? "text-muted-foreground/40 text-xs" : today ? "text-primary text-xs font-bold" : "text-foreground text-xs"}>{day}</Text>
                  </Pressable>
                </View>
              );
            })}
          </View>

          <View className="mt-2 pt-2 border-t border-border flex-row justify-end">
            <Pressable accessibilityRole="button" accessibilityLabel="Select today" onPress={chooseToday} className="h-9 px-3 rounded-xl bg-primary/10 items-center justify-center">
              <Text className="text-primary text-button font-semibold">Today</Text>
            </Pressable>
          </View>
        </View>,
        document.body,
      ) : null}
    </View>
  );
}
