import { useCallback } from "react";

/**
 * Under the Centralised Admin-Managed Enquiry System, pre-booking customer
 * enquiries are handled by RoyalLagn Admin and vendors do not receive enquiry badges.
 */
export function useVendorEnquiryUnreadCount() {
  const refresh = useCallback(async () => {}, []);
  return { unreadCount: 0, refresh };
}
