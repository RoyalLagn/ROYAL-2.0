import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AdminDashboardService } from "@/services/adminDashboardService";
import type { AdminDashboardSnapshot } from "@/types/adminDashboard";

type Value = {
  snapshot: AdminDashboardSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
};

const AdminDashboardContext = createContext<Value | null>(null);

export function AdminDashboardProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    try {
      setSnapshot(await AdminDashboardService.load(force));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = AdminDashboardService.subscribe(
      () => {
        AdminDashboardService.invalidate();
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => void load(true), 250);
      },
      (online) => {
        setSnapshot((current) => current
          ? {
              ...current,
              health: current.health.data
                ? {
                    data: { ...current.health.data, realtime: online ? "online" : "unavailable" },
                    error: current.health.error,
                  }
                : current.health,
            }
          : current);
      },
    );
    const fallbackRefresh = setInterval(() => {
      AdminDashboardService.invalidate();
      void load(true);
    }, 60_000);
    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(fallbackRefresh);
      unsubscribe();
    };
  }, [load]);

  const refresh = useCallback(() => load(true), [load]);
  const value = useMemo(
    () => ({ snapshot, loading, refreshing, refresh }),
    [loading, refresh, refreshing, snapshot],
  );
  return <AdminDashboardContext.Provider value={value}>{children}</AdminDashboardContext.Provider>;
}

export function useAdminDashboard() {
  const value = useContext(AdminDashboardContext);
  if (!value) throw new Error("useAdminDashboard must be used inside AdminDashboardProvider.");
  return value;
}
