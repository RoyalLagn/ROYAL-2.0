import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useAdminAuth } from "@/context/AdminAuthContext";

const ADMIN_ROUTES = new Set([
  "/admin-dashboard",
  "/admin-dash-logout",
  "/vendors-admin-listing",
  "/VendorApplications",
  "/VendorApplicationDetails",
  "/subscriptions-admin",
  "/payments-admin",
  "/AdminUsers",
  "/AdminCategories",
  "/AdminReports",
  "/AdminSettings",
  "/AdminHelp",
]);

const ADMIN_AUTH_ROUTES = new Set([
  "/AdminLogin",
  "/AdminForgotPassword",
  "/AdminOtpVerification",
  "/AdminCreatePassword",
]);

function isProtectedAdminRoute(pathname: string) {
  if (ADMIN_AUTH_ROUTES.has(pathname)) return false;
  return ADMIN_ROUTES.has(pathname) || pathname.toLowerCase().includes("admin");
}

export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdminAuthenticated, loading, signOut } = useAdminAuth();
  const protectedRoute = isProtectedAdminRoute(pathname);

  useEffect(() => {
    if (protectedRoute && !loading && !isAdminAuthenticated) {
      void signOut().finally(() => {
        router.dismissAll();
        router.replace("/AdminLogin");
      });
    }
  }, [isAdminAuthenticated, loading, protectedRoute, router, signOut]);

  if (protectedRoute && (loading || !isAdminAuthenticated)) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#E91E63" />
      </View>
    );
  }
  return <>{children}</>;
}
