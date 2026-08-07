import React, { Suspense, lazy } from "react";
import { useWindowDimensions, View, StyleSheet } from "react-native";
import { usePathname } from "expo-router";
import { isAdminWorkspaceRoute } from "@/admin/navigationRoutes";

/**
 * Lightweight shell: only mounts the heavy admin sidebar (and its lucide/
 * navigation graph) when the user is actually on an admin workspace route.
 */
const AdminSidebar = lazy(() =>
  import("@/components/admin/AdminWorkspaceSidebar").then((mod) => ({
    default: mod.AdminWorkspaceSidebar,
  })),
);

export function AdminWorkspaceShell({ children }: React.PropsWithChildren) {
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  if (!isAdminWorkspaceRoute(pathname) || width < 768) return <>{children}</>;
  return (
    <View style={styles.shell}>
      <Suspense fallback={<View style={styles.sidebarFallback} />}>
        <AdminSidebar compact={width < 1040} />
      </Suspense>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, flexDirection: "row", minHeight: 0 },
  content: { flex: 1, minWidth: 0, minHeight: 0 },
  sidebarFallback: { width: 248, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: "#EDE8EB" },
});
