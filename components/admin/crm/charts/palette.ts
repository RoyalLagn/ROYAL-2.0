export const chartPalette = [
  "#0878E8", "#7C3AED", "#C58A18", "#10B981",
  "#3B82F6", "#062B63", "#14B8A6", "#F97316",
];

export const chartColorFor = (index: number) => chartPalette[index % chartPalette.length];
