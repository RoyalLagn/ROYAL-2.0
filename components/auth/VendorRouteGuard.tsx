import React, { useEffect, useRef } from "react";
import { usePathname, useRouter } from "expo-router";
import { useVendorAuth } from "@/context/VendorAuthContext";
import { isProtectedVendorRoute } from "@/vendor/navigation";
import PageLoader from "@/components/loading/PageLoader";

/**
 * Guards every authenticated Vendor workspace route (see
 * vendor/navigation.ts) behind one authoritative check: a valid session,
 * a "vendor" role from the profiles table, an existing application, and a
 * linked workspace -- all already computed by
 * resolveVendorDestination() inside VendorAuthContext. This is the only
 * place that redirects an invalid Vendor visit to a workspace route; screens
 * underneath it never need their own access checks.
 */
export function VendorRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolution, loading, isVendorAuthenticated } = useVendorAuth();
  const protectedRoute = isProtectedVendorRoute(pathname);
  const redirecting = useRef(false);

  useEffect(() => {
    if (!protectedRoute || loading || isVendorAuthenticated) {
      redirecting.current = false;
      return;
    }
    if (redirecting.current) return;
    redirecting.current = true;
    // Reuse the destination the context already resolved instead of
    // resolving again -- one fetch, one decision, one redirect.
    router.replace((resolution?.destination ?? { pathname: "/VendorAuth" }) as never);
  }, [isVendorAuthenticated, loading, protectedRoute, resolution, router]);

  if (protectedRoute && (loading || !isVendorAuthenticated)) {
    return <PageLoader />;
  }
  return <>{children}</>;
}
