import React, { useEffect } from "react";
import { usePathname, useRouter } from "expo-router";
import { useVendorAuth } from "@/context/VendorAuthContext";
import { isProtectedVendorRoute } from "@/vendor/navigation";
import PageLoader from "@/components/loading/PageLoader";

/**
 * Guards every authenticated Vendor workspace route (see
 * vendor/navigation.ts) behind one authoritative check: a valid session,
 * a "vendor" role from the profiles table, an existing application,
 * approved status, and a verified vendor record -- all already computed by
 * resolveVendorDestination() inside VendorAuthContext. This is the only
 * place that redirects an invalid Vendor visit to a workspace route; screens
 * underneath it never need their own access checks.
 */
export function VendorRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolution, loading, isVendorAuthenticated } = useVendorAuth();
  const protectedRoute = isProtectedVendorRoute(pathname);

  useEffect(() => {
    if (!protectedRoute || loading || isVendorAuthenticated) return;
    // Reuse the destination the context already resolved instead of
    // resolving again -- one fetch, one decision, one redirect.
    if (router.canDismiss()) router.dismissAll();
    router.replace((resolution?.destination ?? { pathname: "/Login" }) as never);
  }, [isVendorAuthenticated, loading, protectedRoute, resolution, router]);

  if (protectedRoute && (loading || !isVendorAuthenticated)) {
    return <PageLoader />;
  }
  return <>{children}</>;
}
