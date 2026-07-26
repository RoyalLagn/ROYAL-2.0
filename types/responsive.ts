export type Breakpoint =
  | "xs"
  | "sm"
  | "phone"
  | "tablet"
  | "tabletLarge"
  | "desktop"
  | "desktopLarge"
  | "ultrawide";

export type ResponsiveLayout = {
  width: number;
  height: number;
  breakpoint: Breakpoint;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isLandscape: boolean;
  contentPadding: number;
  sectionGap: number;
  cardPadding: number;
  cardRadius: number;
  iconSize: number;
  titleSize: number;
  bodySize: number;
  statisticColumns: number;
  widgetColumns: number;
};
