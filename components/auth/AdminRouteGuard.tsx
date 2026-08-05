import React, { useEffect } from "react";
import { usePathname, useRouter } from "expo-router";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { isProtectedAdminRoute } from "@/admin/navigation";
import BrandedLoader from "@/components/loading/BrandedLoader";

export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdminAuthenticated, loading, signOut } = useAdminAuth();
  const protectedRoute = isProtectedAdminRoute(pathname);

  useEffect(() => {
    if (protectedRoute && !loading && !isAdminAuthenticated) {
      void signOut().finally(() => {
        if (router.canDismiss()) router.dismissAll();
        router.replace("/AdminLogin");
      });
    }
  }, [isAdminAuthenticated, loading, protectedRoute, router, signOut]);

  if (protectedRoute && (loading || !isAdminAuthenticated)) {
    // Admin session restoration is exactly the "no usable screen can yet be
    // displayed" case the branded loader is reserved for -- an admin table
    // or dashboard can't render anything meaningful until we know whether
    // this session is authenticated.
    return <BrandedLoader message="Preparing your admin workspace..." />;
  }
  return <>{children}</>;
}
