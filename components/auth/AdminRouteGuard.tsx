import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { isProtectedAdminRoute } from "@/admin/navigation";

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
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" color="#E91E63" />
      </View>
    );
  }
  return <>{children}</>;
}
