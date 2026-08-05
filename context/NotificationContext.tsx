import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePublicAuth } from "@/context/PublicAuthContext";
import { supabase } from "@/services/supabase";
import {
  CustomerInboxService,
  type CustomerInboxRow,
} from "@/services/inboxNotifications";

export type NotificationType =
  | "vendor_approval"
  | "booking_confirmed"
  | "booking_cancelled"
  | "new_offer"
  | "admin_announcement"
  | "profile_updated"
  | "payment_reminder";

export type RoyalLagnNotification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  readAt?: string | null;
  targetPath?: string | null;
};

export type NewNotification = Omit<
  RoyalLagnNotification,
  "id" | "timestamp" | "read" | "readAt"
> & {
  id?: string;
  timestamp?: string;
  read?: boolean;
  readAt?: string | null;
};

type NotificationContextValue = {
  notifications: RoyalLagnNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  addNotification: (notification: NewNotification) => string;
  markAsRead: (id: string) => Promise<boolean>;
  markAllAsRead: () => Promise<boolean>;
  deleteNotification: (id: string) => Promise<boolean>;
  clearNotifications: () => Promise<boolean>;
  refreshNotifications: () => Promise<void>;
};

const notificationTypes: NotificationType[] = [
  "vendor_approval",
  "booking_confirmed",
  "booking_cancelled",
  "new_offer",
  "admin_announcement",
  "profile_updated",
  "payment_reminder",
];

const NotificationContext = createContext<NotificationContextValue | null>(null);
let customerNotificationChannelSequence = 0;

const createLocalId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });

const normalizeType = (value: string): NotificationType =>
  notificationTypes.includes(value as NotificationType)
    ? (value as NotificationType)
    : "admin_announcement";

const fromRow = (row: CustomerInboxRow): RoyalLagnNotification => ({
  id: row.id,
  type: normalizeType(row.type),
  title: row.title,
  message: row.message,
  timestamp: row.created_at,
  read: row.is_read,
  readAt: row.read_at,
  targetPath: row.target_path,
});

const sortByNewest = (items: RoyalLagnNotification[]) =>
  [...items].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

const upsertNotification = (
  current: RoyalLagnNotification[],
  next: RoyalLagnNotification,
) => sortByNewest([next, ...current.filter((item) => item.id !== next.id)]);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { profile } = usePublicAuth();
  const customerId = profile?.role === "public_user" ? profile.id : null;
  const [notifications, setNotifications] = useState<RoyalLagnNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeCustomerId = useRef<string | null>(null);
  const mounted = useRef(true);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshNotifications = useCallback(async () => {
    if (!customerId) {
      activeCustomerId.current = null;
      initialLoadDone.current = false;
      if (mounted.current) {
        setNotifications([]);
        setLoading(false);
        setError(null);
      }
      return;
    }

    activeCustomerId.current = customerId;
    if (mounted.current && !initialLoadDone.current) setLoading(true);

    try {
      const rows = await CustomerInboxService.list(customerId);
      if (!mounted.current || activeCustomerId.current !== customerId) return;
      setNotifications(rows.map(fromRow));
      setError(null);
      initialLoadDone.current = true;
    } catch (err) {
      if (!mounted.current || activeCustomerId.current !== customerId) return;
      setError(err instanceof Error ? err.message : "Failed to load notifications.");
    } finally {
      if (mounted.current && activeCustomerId.current === customerId) {
        setLoading(false);
      }
    }
  }, [customerId]);

  useEffect(() => {
    initialLoadDone.current = false;
    setNotifications([]);
    void refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    if (!customerId) return;

    customerNotificationChannelSequence += 1;
    const channelName = `customer-notifications-${customerId}-${customerNotificationChannelSequence}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "customer_notifications",
          filter: `customer_id=eq.${customerId}`,
        },
        (payload) => {
          if (!mounted.current || activeCustomerId.current !== customerId) return;
          const row = payload.new as CustomerInboxRow;
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
          table: "customer_notifications",
          filter: `customer_id=eq.${customerId}`,
        },
        (payload) => {
          if (!mounted.current || activeCustomerId.current !== customerId) return;
          const row = payload.new as CustomerInboxRow;
          if (!row?.id) return;
          setNotifications((current) => upsertNotification(current, fromRow(row)));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "customer_notifications",
          filter: `customer_id=eq.${customerId}`,
        },
        (payload) => {
          if (!mounted.current || activeCustomerId.current !== customerId) return;
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
  }, [customerId]);

  const addNotification = useCallback(
    (notification: NewNotification) => {
      const id = notification.id ?? createLocalId();
      const nextNotification: RoyalLagnNotification = {
        ...notification,
        id,
        timestamp: notification.timestamp ?? new Date().toISOString(),
        read: notification.read ?? false,
        readAt: notification.readAt ?? null,
        targetPath: notification.targetPath ?? null,
      };
      setNotifications((current) => upsertNotification(current, nextNotification));

      if (customerId) {
        void supabase
          .from("customer_notifications")
          .insert({
            id,
            customer_id: customerId,
            type: nextNotification.type,
            title: nextNotification.title,
            message: nextNotification.message,
            target_path: nextNotification.targetPath,
            is_read: nextNotification.read,
            read_at: nextNotification.readAt,
            created_at: nextNotification.timestamp,
          })
          .then(({ error: insertError }) => {
            if (insertError) {
              setNotifications((current) => current.filter((item) => item.id !== id));
              setError(insertError.message);
            }
          });
      }
      return id;
    },
    [customerId],
  );

  const markAsRead = useCallback(
    async (id: string) => {
      const target = notifications.find((item) => item.id === id);
      if (!target || target.read) return true;

      const previousReadAt = target.readAt ?? null;
      const readAt = new Date().toISOString();
      setNotifications((current) =>
        current.map((item) =>
          item.id === id ? { ...item, read: true, readAt } : item,
        ),
      );
      if (!customerId) return true;

      try {
        await CustomerInboxService.markRead(customerId, id);
        return true;
      } catch (err) {
        setNotifications((current) =>
          current.map((item) =>
            item.id === id ? { ...item, read: false, readAt: previousReadAt } : item,
          ),
        );
        setError(err instanceof Error ? err.message : "Could not mark as read.");
        return false;
      }
    },
    [customerId, notifications],
  );

  const markAllAsRead = useCallback(async () => {
    const unreadIds = notifications.filter((item) => !item.read).map((item) => item.id);
    if (!unreadIds.length) return true;

    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) => (item.read ? item : { ...item, read: true, readAt })),
    );
    if (!customerId) return true;

    try {
      await CustomerInboxService.markAllRead(customerId);
      return true;
    } catch (err) {
      const unreadSet = new Set(unreadIds);
      setNotifications((current) =>
        current.map((item) =>
          unreadSet.has(item.id) ? { ...item, read: false, readAt: null } : item,
        ),
      );
      setError(err instanceof Error ? err.message : "Could not mark all as read.");
      return false;
    }
  }, [customerId, notifications]);

  const deleteNotification = useCallback(
    async (id: string) => {
      const previous = notifications;
      setNotifications((current) => current.filter((item) => item.id !== id));
      if (!customerId) return true;

      try {
        await CustomerInboxService.remove(customerId, id);
        return true;
      } catch (err) {
        setNotifications(previous);
        setError(err instanceof Error ? err.message : "Could not delete notification.");
        return false;
      }
    },
    [customerId, notifications],
  );

  const clearNotifications = useCallback(async () => {
    const previous = notifications;
    setNotifications([]);
    if (!customerId) return true;

    try {
      await CustomerInboxService.clearAll(customerId);
      return true;
    } catch (err) {
      setNotifications(previous);
      setError(err instanceof Error ? err.message : "Could not clear notifications.");
      return false;
    }
  }, [customerId, notifications]);

  const unreadCount = useMemo(
    () => notifications.reduce((count, notification) => count + Number(!notification.read), 0),
    [notifications],
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      loading,
      error,
      addNotification,
      markAsRead,
      markAllAsRead,
      deleteNotification,
      clearNotifications,
      refreshNotifications,
    }),
    [
      addNotification,
      clearNotifications,
      deleteNotification,
      error,
      loading,
      markAllAsRead,
      markAsRead,
      notifications,
      refreshNotifications,
      unreadCount,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error("useNotifications must be used inside NotificationProvider.");
  return value;
}
