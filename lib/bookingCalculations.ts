// lib/bookingCalculations.ts
// Authoritative shared calculation logic for RoyalLagn Direct Bookings

export interface SelectedPackageSummary {
  id: string;
  title: string;
  price: number;
  discounted_price?: number | null;
  price_type?: "starting" | "fixed" | "contact" | string | null;
  duration_label?: string | null;
  service_category?: string | null;
}

export interface BookingAddOn {
  id?: string;
  title: string;
  price: number;
}

/**
 * Calculates inclusive event days between two ISO date strings (YYYY-MM-DD).
 * Avoids timezone / DST drifts by parsing discrete year, month, date parts.
 *
 * Example:
 * 10 Dec -> 10 Dec = 1 event day
 * 10 Dec -> 11 Dec = 2 event days
 * 10 Dec -> 13 Dec = 4 event days
 */
export function calculateEventDays(startDateStr?: string | null, endDateStr?: string | null): number {
  if (!startDateStr) return 1;
  const cleanStart = startDateStr.slice(0, 10);
  const cleanEnd = (endDateStr || startDateStr).slice(0, 10);
  if (cleanStart === cleanEnd) return 1;

  const [startY, startM, startD] = cleanStart.split("-").map(Number);
  const [endY, endM, endD] = cleanEnd.split("-").map(Number);

  if (!startY || !startM || !startD || !endY || !endM || !endD) return 1;

  // Use UTC midnight timestamps to prevent daylight savings shifts
  const startUtc = Date.UTC(startY, startM - 1, startD);
  const endUtc = Date.UTC(endY, endM - 1, endD);

  const diffMs = endUtc - startUtc;
  if (diffMs < 0) return 1;

  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, diffDays + 1); // Inclusive calendar day count
}

/**
 * Determines whether a package price is per-day or fixed per-event based on duration_label & price_type.
 */
export function isPerDayPackage(pkg: SelectedPackageSummary): boolean {
  const duration = (pkg.duration_label || "").toLowerCase();
  const priceType = (pkg.price_type || "").toLowerCase();

  if (duration.includes("day") || duration.includes("daily") || duration.includes("per day")) {
    return true;
  }
  if (duration.includes("event") || duration.includes("fixed") || priceType === "fixed") {
    return false;
  }
  // Default: if price_type is 'starting' or duration mentions hours/days
  return true;
}

export interface CalculatedPackageSnapshot {
  id: string;
  title: string;
  unit_price: number;
  is_per_day: boolean;
  days_applied: number;
  subtotal: number;
  duration_label?: string | null;
  price_type?: string | null;
}

export interface BookingFinancials {
  totalDays: number;
  packagesCount: number;
  packagesList: CalculatedPackageSnapshot[];
  packagesTotal: number;
  addOnsTotal: number;
  grandTotal: number;
  advanceAmount: number; // 30% strictly
  dueAmount: number;     // 70% remaining
  advancePaise: number;
  grandTotalPaise: number;
}

/**
 * Calculates complete authoritative financial breakdown.
 */
export function calculateBookingFinancials(
  packages: SelectedPackageSummary[],
  startDateStr: string,
  endDateStr: string,
  addOns: BookingAddOn[] = []
): BookingFinancials {
  const days = calculateEventDays(startDateStr, endDateStr);

  const calculatedPackages: CalculatedPackageSnapshot[] = (packages || []).map((pkg) => {
    const unitPrice = Number(pkg.discounted_price ?? pkg.price ?? 0);
    const perDay = isPerDayPackage(pkg);
    const daysApplied = perDay ? days : 1;
    const subtotal = Math.round(unitPrice * daysApplied);

    return {
      id: pkg.id,
      title: pkg.title,
      unit_price: unitPrice,
      is_per_day: perDay,
      days_applied: daysApplied,
      subtotal,
      duration_label: pkg.duration_label || null,
      price_type: pkg.price_type || null,
    };
  });

  const packagesTotal = calculatedPackages.reduce((sum, item) => sum + item.subtotal, 0);
  const addOnsTotal = (addOns || []).reduce((sum, item) => sum + (Number(item.price) || 0), 0);
  const grandTotal = Math.max(0, Math.round(packagesTotal + addOnsTotal));

  // Integer paise calculations to avoid floating point imprecision
  const grandTotalPaise = grandTotal * 100;
  const advancePaise = Math.round(grandTotalPaise * 0.30);
  const duePaise = grandTotalPaise - advancePaise;

  const advanceAmount = advancePaise / 100;
  const dueAmount = duePaise / 100;

  return {
    totalDays: days,
    packagesCount: packages.length,
    packagesList: calculatedPackages,
    packagesTotal,
    addOnsTotal,
    grandTotal,
    advanceAmount,
    dueAmount,
    advancePaise,
    grandTotalPaise,
  };
}
