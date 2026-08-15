import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { isProtectedAdminRoute } from "@/admin/navigation";
import PageLoader from "@/components/loading/PageLoader";

export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdminAuthenticated, loading, mfaRequirement } = useAdminAuth();
  const protectedRoute = isProtectedAdminRoute(pathname);
  const mobileAdminRoute = protectedRoute && Platform.OS !== "web";
  const redirecting = useRef(false);

  useEffect(() => {
    const shouldRedirect = mobileAdminRoute || (protectedRoute && !loading && !isAdminAuthenticated);
    if (!shouldRedirect) {
      redirecting.current = false;
      return;
    }
    if (!redirecting.current) {
      redirecting.current = true;
      // Only redirect. Signing out here would also destroy a public or vendor
      // session, because all roles share one Supabase session — and a customer
      // landing on an admin URL must not be logged out of their own account.
      // Genuinely unauthorized admin sessions are already cleared by
      // verifyAdminSession() in services/adminAuth.ts.
      if (router.canDismiss()) router.dismissAll();
      const destination = Platform.OS !== "web"
        ? "/Login"
        : mfaRequirement === "setup"
          ? "/AdminMfaSetup"
          : mfaRequirement === "verify"
            ? "/AdminMfaVerify"
            : "/AdminLogin";
      router.replace(destination);
    }
  }, [isAdminAuthenticated, loading, mfaRequirement, mobileAdminRoute, protectedRoute, router]);

  if (mobileAdminRoute || (protectedRoute && (loading || !isAdminAuthenticated))) {
    return <PageLoader />;
  }
  return <>{children}</>;
}
