export type CompletionState = "complete" | "partial" | "missing" | "attention";

const hasText = (value?: string | null) => Boolean(value?.trim());

/**
 * Canonical readiness rules. A section is complete when every field that
 * its editor actually requires has been saved. Optional recommendations
 * improve profile quality but must not leave a successfully saved section
 * stuck at "In progress".
 */
export const VendorReadinessRules = {
  businessInfo(vendor: any | null): CompletionState {
    const v = vendor ?? {};
    if (!hasText(v.business_name)) return "missing";
    if (!hasText(v.owner_name) || !v.category_id) return "partial";
    return "complete";
  },
  about(vendor: any | null): CompletionState {
    return hasText(vendor?.description) ? "complete" : "missing";
  },
  location(vendor: any | null): CompletionState {
    const v = vendor ?? {};
    const hasPincode = /^[1-9][0-9]{5}$/.test(v.pincode ?? "");
    const hasLocality = Boolean(v.geo_pincode_locality_id);
    const hasResolvedHierarchy = Boolean(v.geo_taluka_id && v.geo_district_id && v.geo_state_id);
    if (!hasPincode) return "missing";
    if (!hasLocality || !hasResolvedHierarchy) return "partial";
    return "complete";
  },
  contact(vendor: any | null): CompletionState {
    const v = vendor ?? {};
    const hasPrimary = hasText(v.contact_email) || hasText(v.contact_phone);
    const hasBonus = hasText(v.website) || hasText(v.instagram) || hasText(v.facebook);
    if (hasPrimary) return "complete";
    if (hasBonus) return "partial";
    return "missing";
  },
  brand(vendor: any | null): CompletionState {
    return hasText(vendor?.logo_url) ? "complete" : "missing";
  },
  services(services: any[]): CompletionState {
    if (!services.length) return "missing";
    return services.some((service) => service.status === "active") ? "complete" : "partial";
  },
  pricing(services: any[]): CompletionState {
    const active = services.filter((service) => service.status === "active");
    if (!active.length) return "missing";
    const priced = active.some((service) => service.price_type !== "contact" && Number(service.price) > 0);
    return priced ? "complete" : "partial";
  },
  portfolio(albums: any[], media: any[]): CompletionState {
    if (!media.length) return "missing";
    return media.length >= 6 && albums.length >= 1 ? "complete" : "partial";
  },
  availability(vendor: any | null, _availability: any[]): CompletionState {
    // Future dates are available by default; an empty exception list is a
    // complete and valid calendar, not missing setup.
    return vendor ? "complete" : "attention";
  },
  tags(vendor: any | null): CompletionState {
    return (vendor?.tags?.length ?? 0) > 0 ? "complete" : "missing";
  },
};
