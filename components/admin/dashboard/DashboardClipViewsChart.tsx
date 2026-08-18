import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { Clapperboard } from "lucide-react-native";
import { DashboardWidget } from "@/components/admin/dashboard/DashboardWidget";
import AdminChart from "@/components/admin/revenue/AdminChart";
import { AdminClipAnalyticsService, type ClipAnalyticsResult } from "@/services/adminClipAnalytics";
import { DateField } from "@/components/admin/crm/ui/DateField";

function monthStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function DashboardClipViewsChart() {
  const currentMonth = useMemo(() => monthStart(new Date()), []);
  const [month, setMonth] = useState(currentMonth);
  const [result, setResult] = useState<ClipAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const { width } = useWindowDimensions();

  const period = useMemo(() => {
    const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    return {
      start: dateKey(month),
      end: dateKey(end),
      label: month.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
      range: `${month.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
    };
  }, [month]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const data = await AdminClipAnalyticsService.load({
        startDate: period.start,
        endDate: period.end,
        aggregation: "day",
      });
      if (id === requestId.current) setResult(data);
    } catch (cause) {
      if (id === requestId.current) {
        setError(cause instanceof Error ? cause.message : "Unable to load clip views.");
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [period.end, period.start]);

  useEffect(() => { void load(); }, [load]);

  const labels = result?.trend.map((point) => new Date(`${point.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })) ?? [];
  const values = result?.trend.map((point) => point.views) ?? [];
  const noViews = !loading && !error && (result?.summary.views ?? 0) === 0;

  return (
    <DashboardWidget
      title="Monthly Clip Views"
      subtitle="Daily view movement for the selected month"
      icon={Clapperboard}
      loading={loading && !result}
      error={error}
      onRefresh={() => void load()}
      allowOverflow
    >
      <View className={width < 680 ? "gap-3 mb-4" : "flex-row items-center justify-between gap-4 mb-4"}>
        <View className="min-w-56">
          <DateField
            label="Clip views month"
            hideLabel
            value={dateKey(month)}
            displayValue={period.label}
            maximumDate={dateKey(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0))}
            onChange={(value) => setMonth(monthStart(new Date(`${value}T00:00:00`)))}
          />
          <Text className="text-muted-foreground text-caption mt-1">{period.range}</Text>
        </View>
        <View className="items-end">
          <Text className="text-foreground text-xl font-bold">{(result?.summary.views ?? 0).toLocaleString("en-IN")}</Text>
          <Text className="text-muted-foreground text-caption">total views</Text>
        </View>
      </View>

      <View className="bg-background border border-border rounded-xl px-3 pt-4 pb-2 min-h-[290px] justify-center">
        {noViews ? (
          <View className="min-h-[250px] items-center justify-center px-4">
            <Text className="text-foreground text-sm font-bold text-center">No clip views recorded for {period.label}.</Text>
          </View>
        ) : (
          <AdminChart
            type="line"
            labels={labels}
            datasets={[{ label: "Views", data: values }]}
            height={260}
            valueFormatter={(value) => Math.round(value).toLocaleString("en-IN")}
            tooltipFooter={(_value, index) => {
              const previous = values[index - 1] ?? 0;
              const current = values[index] ?? 0;
              const change = previous ? (current - previous) / previous * 100 : current ? 100 : 0;
              return `Change vs previous day: ${change >= 0 ? "+" : ""}${change.toFixed(1)}%`;
            }}
          />
        )}
        {loading && result ? (
          <View className="absolute inset-0 rounded-2xl bg-background/70 items-center justify-center">
            <Text className="text-muted-foreground text-xs font-semibold">Updating clip views…</Text>
          </View>
        ) : null}
      </View>
    </DashboardWidget>
  );
}
