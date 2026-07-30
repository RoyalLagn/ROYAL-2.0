export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateEmail = (value: string) =>
  EMAIL_PATTERN.test(value.trim().toLowerCase());

export const validateFullName = (value: string) => value.trim().length > 0;

export const normalizePhone = (value: string) => {
  const trimmed = value.trim();
  const hasInternationalPrefix = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  return hasInternationalPrefix ? `+${digits}` : digits;
};

export const validatePhone = (value: string) => {
  const normalized = normalizePhone(value);
  const digits = normalized.replace(/\D/g, "");
  return /^\+?\d+$/.test(normalized) && digits.length >= 7 && digits.length <= 15;
};

export const normalizeOptionalUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS links are supported.");
  }
  return parsed.toString();
};

const socialHosts = {
  instagram: new Set(["instagram.com", "www.instagram.com"]),
  facebook: new Set(["facebook.com", "www.facebook.com", "fb.com", "www.fb.com"]),
} as const;

export const normalizeSocialUrl = (
  value: string,
  platform: keyof typeof socialHosts,
) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const handle = trimmed.replace(/^@/, "");
  const candidate = /^[a-zA-Z0-9._-]+$/.test(handle)
    ? `https://${platform}.com/${handle}`
    : normalizeOptionalUrl(trimmed);
  if (!candidate) return null;
  const parsed = new URL(candidate);
  if (!socialHosts[platform].has(parsed.hostname.toLowerCase())) {
    throw new Error(`Enter a valid ${platform === "instagram" ? "Instagram" : "Facebook"} link or username.`);
  }
  return parsed.toString();
};

export const passwordRequirements = (value: string) => ({
  minimumLength: value.length >= 8,
  uppercase: /[A-Z]/.test(value),
  lowercase: /[a-z]/.test(value),
  number: /\d/.test(value),
});

export const validatePassword = (value: string) =>
  Object.values(passwordRequirements(value)).every(Boolean);
