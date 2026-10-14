// royal/lib/bookingCancellationPolicy.ts
// Authoritative shared business policy for RoyalLagn 5-Day (120 Hours) Cancellation Lock
// and Automatic Contact Details Unlock System.

export const CANCELLATION_WINDOW_HOURS = 120; // Exactly 5 days
export const CANCELLATION_WINDOW_MS = CANCELLATION_WINDOW_HOURS * 60 * 60 * 1000;

export const STANDARD_TIME_SLOTS = [
  { id: "08:00", label: "08:00 AM (Early Morning)" },
  { id: "10:00", label: "10:00 AM (Morning Ceremony)" },
  { id: "12:00", label: "12:00 PM (Noon Muhurat)" },
  { id: "14:00", label: "02:00 PM (Afternoon)" },
  { id: "16:00", label: "04:00 PM (Evening Start)" },
  { id: "18:00", label: "06:00 PM (Reception / Dinner)" },
  { id: "20:00", label: "08:00 PM (Night Celebration)" },
] as const;

/**
 * Builds canonical UTC/ISO timestamp for the event start in Asia/Kolkata timezone (+05:30).
 */
export function buildEventStartTimestamp(
  eventDateStr: string,
  timeSlot?: string | null
): string {
  const cleanDate = (eventDateStr || "").slice(0, 10);
  const time = (timeSlot || "").trim() || "10:00";
  // Format: YYYY-MM-DDTHH:mm:00+05:30
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  const isoString = `${cleanDate}T${normalizedTime}+05:30`;
  try {
    return new Date(isoString).toISOString();
  } catch {
    return new Date(`${cleanDate}T10:00:00+05:30`).toISOString();
  }
}

/**
 * Calculates canonical cancellation cutoff timestamp (eventStartAt - 120 hours).
 */
export function calculateCancellationCutoff(eventStartAtIso: string): string {
  const eventStartMs = new Date(eventStartAtIso).getTime();
  const cutoffMs = eventStartMs - CANCELLATION_WINDOW_MS;
  return new Date(cutoffMs).toISOString();
}

/**
 * Under the new model, cancellation is prohibited once the booking is ACCEPTED.
 * Pre-acceptance (ADMIN_PENDING, VENDOR_PENDING) allows 100% refundable cancellation.
 */
export function isCancellationLocked(
  cancellationCutoffAt?: string | null,
  eventStartAt?: string | null,
  eventDate?: string | null,
  bookingStatus?: string | null
): boolean {
  if (bookingStatus) {
    const norm = bookingStatus.toUpperCase();
    if (norm === "ACCEPTED" || norm === "CONFIRMED") return true;
    if (norm === "ADMIN_PENDING" || norm === "VENDOR_PENDING" || norm === "PENDING" || norm === "PENDING_VENDOR_CONFIRMATION") return false;
  }

  let cutoffMs: number | null = null;

  if (cancellationCutoffAt) {
    cutoffMs = new Date(cancellationCutoffAt).getTime();
  } else if (eventStartAt) {
    cutoffMs = new Date(eventStartAt).getTime() - CANCELLATION_WINDOW_MS;
  } else if (eventDate) {
    const startIso = buildEventStartTimestamp(eventDate, "10:00");
    cutoffMs = new Date(startIso).getTime() - CANCELLATION_WINDOW_MS;
  }

  if (cutoffMs === null || isNaN(cutoffMs)) return false;
  return Date.now() >= cutoffMs;
}

/**
 * Determines whether direct contact details must unlock.
 * MANDATORY RULE: Unlocks immediately upon formal vendor acceptance (ACCEPTED / confirmed).
 * Before vendor acceptance (ADMIN_PENDING, VENDOR_PENDING), contacts strictly remain locked.
 */
export function isContactUnlocked(
  bookingStatus: string,
  cancellationCutoffAt?: string | null,
  eventStartAt?: string | null,
  eventDate?: string | null
): boolean {
  const norm = (bookingStatus || "").toUpperCase();
  return norm === "ACCEPTED" || norm === "CONFIRMED";
}

/**
 * Formats a timestamp into human-readable Indian Standard Time (Asia/Kolkata).
 */
export function formatCutoffDisplayIST(dateOrIso?: string | Date | null): string {
  if (!dateOrIso) return "—";
  try {
    const d = typeof dateOrIso === "string" ? new Date(dateOrIso) : dateOrIso;
    return d.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }) + " IST";
  } catch {
    return String(dateOrIso);
  }
}

/**
 * Returns a live human-readable countdown string until the cancellation cutoff.
 */
export function getTimeRemainingToCutoff(
  cancellationCutoffAt?: string | null,
  eventStartAt?: string | null,
  eventDate?: string | null
): { locked: boolean; label: string; remainingMs: number } {
  let cutoffMs: number = 0;
  if (cancellationCutoffAt) {
    cutoffMs = new Date(cancellationCutoffAt).getTime();
  } else if (eventStartAt) {
    cutoffMs = new Date(eventStartAt).getTime() - CANCELLATION_WINDOW_MS;
  } else if (eventDate) {
    const startIso = buildEventStartTimestamp(eventDate, "10:00");
    cutoffMs = new Date(startIso).getTime() - CANCELLATION_WINDOW_MS;
  }

  const nowMs = Date.now();
  const diffMs = cutoffMs - nowMs;

  if (diffMs <= 0) {
    return {
      locked: true,
      label: "Cancellation Window Closed (Event within 5 days)",
      remainingMs: 0,
    };
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  let label = "";
  if (days > 0) {
    label = `${days} day${days > 1 ? "s" : ""} ${remainingHours} hr${remainingHours !== 1 ? "s" : ""} left to cancel`;
  } else {
    label = `${hours} hour${hours !== 1 ? "s" : ""} left to cancel`;
  }

  return {
    locked: false,
    label,
    remainingMs: diffMs,
  };
}

/**
 * Validates Indian 10-digit mobile phone numbers.
 */
export function validateIndianPhone(phone: string): {
  valid: boolean;
  cleaned: string;
  error?: string;
} {
  const cleaned = (phone || "").replace(/\D/g, "");
  // Standard Indian 10-digit mobile starts with 6, 7, 8, or 9
  // If user entered +91 or 91 prefix, strip it
  let tenDigit = cleaned;
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    tenDigit = cleaned.slice(2);
  } else if (cleaned.length === 11 && cleaned.startsWith("0")) {
    tenDigit = cleaned.slice(1);
  }

  if (tenDigit.length !== 10) {
    return {
      valid: false,
      cleaned: tenDigit,
      error: "Please enter a valid 10-digit mobile number.",
    };
  }

  if (!/^[6-9]\d{9}$/.test(tenDigit)) {
    return {
      valid: false,
      cleaned: tenDigit,
      error: "Indian mobile numbers must start with 6, 7, 8, or 9.",
    };
  }

  return { valid: true, cleaned: tenDigit };
}

/**
 * Validates supported Google Maps location URLs.
 */
export function validateGoogleMapsUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = (url || "").trim();
  if (!trimmed) {
    return {
      valid: false,
      error: "Service location Google Maps link is required.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return {
      valid: false,
      error: "Invalid URL format. Please paste a valid Google Maps link.",
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isGoogleMaps =
    hostname === "maps.google.com" ||
    hostname === "goo.gl" ||
    hostname === "maps.app.goo.gl" ||
    hostname === "google.com" ||
    hostname.endsWith(".google.com") ||
    hostname.endsWith(".google.co.in");

  if (!isGoogleMaps) {
    return {
      valid: false,
      error:
        "Please provide a valid Google Maps URL (e.g., https://maps.app.goo.gl/... or https://maps.google.com/...).",
    };
  }

  return { valid: true };
}

/**
 * Validates booking description (max 2000 characters).
 */
export function validateBookingDescription(text: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return {
      valid: false,
      error: "Booking description is required to explain event arrangements to the vendor.",
    };
  }
  if (trimmed.length > 2000) {
    return {
      valid: false,
      error: `Booking description exceeds maximum limit of 2000 characters (current: ${trimmed.length}).`,
    };
  }
  return { valid: true };
}
