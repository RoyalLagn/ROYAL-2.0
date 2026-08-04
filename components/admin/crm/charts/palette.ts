export const chartPalette = [
  "#E91E63", "#8B5CF6", "#F59E0B", "#10B981",
  "#3B82F6", "#EC4899", "#14B8A6", "#F97316",
];

export const chartColorFor = (index: number) => chartPalette[index % chartPalette.length];
