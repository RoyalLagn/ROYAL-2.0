import React, { useEffect } from "react";
import { Platform } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { isProtectedAdminRoute } from "@/admin/navigation";
import PageLoader from "@/components/loading/PageLoader";

export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdminAuthenticated, loading } = useAdminAuth();
  const protectedRoute = isProtectedAdminRoute(pathname);
  const mobileAdminRoute = protectedRoute && Platform.OS !== "web";

  useEffect(() => {
    if (mobileAdminRoute || (protectedRoute && !loading && !isAdminAuthenticated)) {
      // Only redirect. Signing out here would also destroy a public or vendor
      // session, because all roles share one Supabase session — and a customer
      // landing on an admin URL must not be logged out of their own account.
      // Genuinely unauthorized admin sessions are already cleared by
      // verifyAdminSession() in services/adminAuth.ts.
      if (router.canDismiss()) router.dismissAll();
      router.replace(Platform.OS === "web" ? "/AdminLogin" : "/Login");
    }
  }, [isAdminAuthenticated, loading, mobileAdminRoute, protectedRoute, router]);

  if (mobileAdminRoute || (protectedRoute && (loading || !isAdminAuthenticated))) {
    return <PageLoader />;
  }
  return <>{children}</>;
}
