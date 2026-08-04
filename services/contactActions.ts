export function normalizeWhatsAppPhone(phone?: string | null) {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (/^[6-9]\d{9}$/.test(digits)) return `91${digits}`;
  if (/^0[6-9]\d{9}$/.test(digits)) return `91${digits.slice(1)}`;
  return digits;
}

export function buildVendorProfilePath(vendorId: string, category?: string | null) {
  const entries = [`vendorId=${encodeURIComponent(vendorId)}`];
  if (category?.trim()) entries.push(`category=${encodeURIComponent(category.trim())}`);
  return `/VendorsProfile?${entries.join("&")}`;
}

export function buildVendorProfilePathBySlug(slug: string) {
  return `/vendors/${encodeURIComponent(slug)}`;
}
