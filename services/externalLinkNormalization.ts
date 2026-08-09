function trimmed(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function validHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeWebsiteUrl(value: string | null | undefined) {
  const input = trimmed(value);
  if (!input) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`;
  return validHttpUrl(candidate);
}

export function normalizeInstagramUrl(value: string | null | undefined) {
  let input = trimmed(value);
  if (!input) return null;
  input = input.replace(/^@/, "");
  if (/^(?:www\.)?instagram\.com\//i.test(input)) input = `https://${input}`;
  if (/^https?:\/\//i.test(input)) {
    const normalized = validHttpUrl(input);
    if (!normalized) return null;
    try {
      const parsed = new URL(normalized);
      if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null;
      const username = parsed.pathname.split("/").filter(Boolean)[0] ?? "";
      return /^[a-z0-9._]{1,30}$/i.test(username)
        ? `https://www.instagram.com/${username}/`
        : null;
    } catch {
      return null;
    }
  }
  const username = input.split(/[/?#]/)[0];
  return /^[a-z0-9._]{1,30}$/i.test(username)
    ? `https://www.instagram.com/${username}/`
    : null;
}

export function normalizePhoneNumber(value: string | null | undefined) {
  const input = trimmed(value);
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function normalizeEmailAddress(value: string | null | undefined) {
  const email = trimmed(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export function normalizeGoogleMapsUrl(input: {
  latitude?: number | string | null;
  longitude?: number | string | null;
  address?: string | null;
  googleMapsUrl?: string | null;
}) {
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
  }

  const storedUrl = normalizeWebsiteUrl(input.googleMapsUrl);
  if (storedUrl) {
    try {
      const host = new URL(storedUrl).hostname.toLowerCase();
      if (host === "maps.app.goo.gl" || host === "maps.google.com"
        || host.endsWith(".google.com") || host === "goo.gl") return storedUrl;
    } catch {
      // Fall through to the address search.
    }
  }

  const address = trimmed(input.address);
  return address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;
}
