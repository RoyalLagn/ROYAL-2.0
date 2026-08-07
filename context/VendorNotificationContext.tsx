import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/services/supabase";
import { useVendorSession } from "@/context/VendorSessionContext";
import {
  VendorInboxService,
  type VendorInboxRow,
} from "@/services/inboxNotifications";

export type VendorNotification = {
  id: string;
  vendor_id: string;
  title: string;
  body: string | null;
  kind: string;
  target_path: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

type VendorNotificationContextValue = {
  notifications: VendorNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<boolean>;
  markAllAsRead: () => Promise<boolean>;
  deleteNotification: (id: string) => Promise<boolean>;
  clearNotifications: () => Promise<boolean>;
  clearReadNotifications: () => Promise<boolean>;
};

const VendorNotificationContext = createContext<VendorNotificationContextValue | null>(null);
let vendorNotificationChannelSequence = 0;

const fromRow = (row: VendorInboxRow): VendorNotification => ({
  id: row.id,
  vendor_id: row.vendor_id,
  title: row.title,
  body: row.body,
  kind: row.kind,
  target_path: row.target_path,
  is_read: row.is_read,
  read_at: row.read_at,
  created_at: row.created_at,
});

const sortByNewest = (items: VendorNotification[]) =>
  [...items].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

const upsertNotification = (current: VendorNotification[], next: VendorNotification) =>
  sortByNewest([next, ...current.filter((item) => item.id !== next.id)]);

export function VendorNotificationProvider({ children }: React.PropsWithChildren) {
  const { isPreviewMode, workspaceEpoch } = useVendorSession();
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<VendorNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const refreshRequest = useRef(0);
  const initialLoadDone = useRef(false);
  const activeVendorId = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    if (isPreviewMode) {
      if (mounted.current) {
        setVendorId(null);
        activeVendorId.current = null;
        setNotifications([]);
        setLoading(false);
        setError(null);
        initialLoadDone.current = false;
      }
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      if (mounted.current && request === refreshRequest.current) {
        setVendorId(null);
        activeVendorId.current = null;
        setNotifications([]);
        setLoading(false);
        setError(null);
        initialLoadDone.current = false;
      }
      return;
    }

    if (mounted.current && !initialLoadDone.current) setLoading(true);

    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id")
      .eq("profile_id", authData.user.id)
      .maybeSingle();

    if (request !== refreshRequest.current) return;
    if (vendorError || !vendor) {
      if (mounted.current) {
        setVendorId(null);
        activeVendorId.current = null;
        setNotifications([]);
        setLoading(false);
        setError(vendorError?.message ?? null);
        initialLoadDone.current = false;
      }
      return;
    }

    try {
      const rows = await VendorInboxService.list(vendor.id);
      if (!mounted.current || request !== refreshRequest.current) return;
      setVendorId(vendor.id);
      activeVendorId.current = vendor.id;
      setNotifications(rows.map(fromRow));
      setError(null);
      initialLoadDone.current = true;
    } catch (err) {
      if (!mounted.current || request !== refreshRequest.current) return;
      setVendorId(vendor.id);
      activeVendorId.current = vendor.id;
      setError(err instanceof Error ? err.message : "Failed to load notifications.");
    } finally {
      if (mounted.current && request === refreshRequest.current) {
        setLoading(false);
      }
    }
  }, [isPreviewMode]);

  useEffect(() => {
    initialLoadDone.current = false;
    void refresh();
  }, [refresh, workspaceEpoch]);

  useEffect(() => {
    if (!vendorId) return;

    vendorNotificationChannelSequence += 1;
    const channelName = `vendor-notifications-${vendorId}-${vendorNotificationChannelSequence}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "vendor_notifications",
          filter: `vendor_id=eq.${vendorId}`,
        },
        (payload) => {
          if (!mounted.current || activeVendorId.current !== vendorId) return;
          const row = payload.new as VendorInboxRow;
          if (!row?.id) return;
          setNotifications((current) => upsertNotification(current, fromRow(row)));
          setError(null);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "vendor_notifications",
          filter: `vendor_id=eq.${vendorId}`,
        },
        (payload) => {
          if (!mounted.current || activeVendorId.current !== vendorId) return;
          const row = payload.new as VendorInboxRow;
          if (!row?.id) return;
          setNotifications((current) => upsertNotification(current, fromRow(row)));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "vendor_notifications",
          filter: `vendor_id=eq.${vendorId}`,
        },
        (payload) => {
          if (!mounted.current || activeVendorId.current !== vendorId) return;
          const row = payload.old as { id?: string };
          if (!row?.id) return;
          setNotifications((current) => current.filter((item) => item.id !== row.id));
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" && mounted.current) {
          setError("Live updates unavailable. Pull to refresh.");
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [vendorId]);

  const markAsRead = useCallback(
    async (id: string) => {
      if (!vendorId) return false;
      const target = notifications.find((item) => item.id === id);
      if (!target || target.is_read) return true;

      const previousReadAt = target.read_at;
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) =>
          item.id === id ? { ...item, is_read: true, read_at: readAt } : item,
        ),
      );

      try {
        await VendorInboxService.markRead(vendorId, id);
        return true;
      } catch (err) {
        setNotifications((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, is_read: false, read_at: previousReadAt }
              : item,
          ),
        );
        setError(err instanceof Error ? err.message : "Could not mark as read.");
        return false;
      }
    },
    [notifications, vendorId],
  );

  const markAllAsRead = useCallback(async () => {
    if (!vendorId) return false;
    const unreadIds = notifications.filter((item) => !item.is_read).map((item) => item.id);
    if (!unreadIds.length) return true;

    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) =>
        item.is_read ? item : { ...item, is_read: true, read_at: readAt },
      ),
    );

    try {
      await VendorInboxService.markAllRead(vendorId);
      return true;
    } catch (err) {
      const unreadSet = new Set(unreadIds);
      setNotifications((current) =>
        current.map((item) =>
          unreadSet.has(item.id)
            ? { ...item, is_read: false, read_at: null }
            : item,
        ),
      );
      setError(err instanceof Error ? err.message : "Could not mark all as read.");
      return false;
    }
  }, [notifications, vendorId]);

  const deleteNotification = useCallback(
    async (id: string) => {
      if (!vendorId) return false;
      const previous = notifications;
      setNotifications((current) => current.filter((item) => item.id !== id));

      try {
        await VendorInboxService.remove(vendorId, id);
        return true;
      } catch (err) {
        setNotifications(previous);
        setError(err instanceof Error ? err.message : "Could not delete notification.");
        return false;
      }
    },
    [notifications, vendorId],
  );

  const clearNotifications = useCallback(async () => {
    if (!vendorId) return false;
    const previous = notifications;
    setNotifications([]);

    try {
      await VendorInboxService.clearAll(vendorId);
      return true;
    } catch (err) {
      setNotifications(previous);
      setError(err instanceof Error ? err.message : "Could not clear notifications.");
      return false;
    }
  }, [notifications, vendorId]);

  const clearReadNotifications = useCallback(async () => {
    if (!vendorId) return false;
    const previous = notifications;
    const readIds = new Set(previous.filter((item) => item.is_read).map((item) => item.id));
    if (!readIds.size) return true;
    setNotifications((current) => current.filter((item) => !readIds.has(item.id)));

    try {
      await VendorInboxService.clearRead(vendorId);
      return true;
    } catch (err) {
      setNotifications(previous);
      setError(err instanceof Error ? err.message : "Could not clear read notifications.");
      return false;
    }
  }, [notifications, vendorId]);

  const unreadCount = useMemo(
    () => notifications.reduce((count, notification) => count + Number(!notification.is_read), 0),
    [notifications],
  );

  const value = useMemo<VendorNotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      loading,
      error,
      refresh,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearNotifications,
      clearReadNotifications,
    }),
    [
      clearNotifications,
      clearReadNotifications,
      deleteNotification,
      error,
      loading,
      markAllAsRead,
      markAsRead,
      notifications,
      refresh,
      unreadCount,
    ],
  );

  return (
    <VendorNotificationContext.Provider value={value}>
      {children}
    </VendorNotificationContext.Provider>
  );
}

export function useVendorNotifications() {
  const value = useContext(VendorNotificationContext);
  if (!value) {
    throw new Error("useVendorNotifications must be used inside VendorNotificationProvider.");
  }
  return value;
}
