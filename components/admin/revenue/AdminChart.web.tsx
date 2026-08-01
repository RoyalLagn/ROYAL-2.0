import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import ChartJS from "chart.js/auto";
import type { AdminChartProps } from "./AdminChart";

export default function AdminChart({ type, labels, datasets, currency, height = 240 }: AdminChartProps) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const chart = useRef<ChartJS | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    chart.current?.destroy();
    chart.current = new ChartJS(canvas.current, {
      type,
      data: {
        labels,
        datasets: datasets.map((dataset, index) => ({
          label: dataset.label,
          data: dataset.data,
          borderColor: dataset.borderColor || (index ? "#C58A22" : "#E91E63"),
          backgroundColor: dataset.backgroundColor || (index ? "rgba(197,138,34,.28)" : "rgba(233,30,99,.16)"),
          borderWidth: 2,
          pointRadius: type === "line" ? 2.5 : 0,
          pointHoverRadius: 4,
          tension: .32,
          fill: type === "line",
          borderRadius: type === "bar" ? 8 : 0,
          maxBarThickness: 54,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 260 },
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { display: datasets.length > 1, position: "bottom", labels: { usePointStyle: true, boxWidth: 7, padding: 16, color: "#6F646A", font: { size: 10 } } },
          tooltip: { callbacks: currency ? { label: (context) => `${context.dataset.label}: ₹${Number(context.parsed.y).toLocaleString("en-IN", { maximumFractionDigits: 2 })}` } : undefined },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#8A7D83", maxRotation: 0, autoSkip: true, maxTicksLimit: 12, font: { size: 9 } } },
          y: { beginAtZero: true, border: { display: false }, grid: { color: "rgba(120,105,112,.10)" }, ticks: { color: "#8A7D83", font: { size: 9 }, callback: currency ? (value) => `₹${Number(value).toLocaleString("en-IN", { notation: "compact" })}` : undefined } },
        },
      },
    });
    return () => { chart.current?.destroy(); chart.current = null; };
  }, [currency, datasets, labels, type]);

  return <View style={{ height, width: "100%" }}>{React.createElement("canvas", { ref: canvas, style: { width: "100%", height: "100%" } })}</View>;
}
