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
  addNotification: (notification: NewNotification) => string;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  refreshNotifications: () => Promise<void>;
};

type CustomerNotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  target_path: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
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
    ? value as NotificationType
    : "admin_announcement";

const fromRow = (row: CustomerNotificationRow): RoyalLagnNotification => ({
  id: row.id,
  type: normalizeType(row.type),
  title: row.title,
  message: row.message,
  timestamp: row.created_at,
  read: row.is_read,
  readAt: row.read_at,
  targetPath: row.target_path,
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { profile } = usePublicAuth();
  const customerId = profile?.role === "public_user" ? profile.id : null;
  const [notifications, setNotifications] = useState<RoyalLagnNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const activeCustomerId = useRef<string | null>(null);

  const refreshNotifications = useCallback(async () => {
    if (!customerId) {
      activeCustomerId.current = null;
      setNotifications([]);
      setLoading(false);
      return;
    }

    activeCustomerId.current = customerId;
    setLoading(true);
    const { data, error } = await supabase
      .from("customer_notifications")
      .select("id,type,title,message,target_path,is_read,read_at,created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (activeCustomerId.current !== customerId) return;
    if (!error) setNotifications(((data ?? []) as CustomerNotificationRow[]).map(fromRow));
    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    setNotifications([]);
    void refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    if (!customerId) return;
    customerNotificationChannelSequence += 1;
    const channel = supabase
      .channel(`customer-notifications-${customerId}-${customerNotificationChannelSequence}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_notifications", filter: `customer_id=eq.${customerId}` },
        () => { void refreshNotifications(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [customerId, refreshNotifications]);

  const addNotification = useCallback((notification: NewNotification) => {
    const id = notification.id ?? createLocalId();
    const nextNotification: RoyalLagnNotification = {
      ...notification,
      id,
      timestamp: notification.timestamp ?? new Date().toISOString(),
      read: notification.read ?? false,
      readAt: notification.readAt ?? null,
      targetPath: notification.targetPath ?? null,
    };
    setNotifications((current) => [nextNotification, ...current.filter((item) => item.id !== id)]);

    if (customerId) {
      void supabase.from("customer_notifications").insert({
        id,
        customer_id: customerId,
        type: nextNotification.type,
        title: nextNotification.title,
        message: nextNotification.message,
        target_path: nextNotification.targetPath,
        is_read: nextNotification.read,
        read_at: nextNotification.readAt,
        created_at: nextNotification.timestamp,
      }).then(({ error }) => {
        if (error) setNotifications((current) => current.filter((item) => item.id !== id));
      });
    }
    return id;
  }, [customerId]);

  const markAsRead = useCallback((id: string) => {
    const target = notifications.find((notification) => notification.id === id);
    if (!target || target.read) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((notification) => {
      if (notification.id !== id || notification.read) return notification;
      return { ...notification, read: true, readAt };
    }));
    if (!customerId) return;

    void supabase
      .from("customer_notifications")
      .update({ is_read: true })
      .eq("customer_id", customerId)
      .eq("id", id)
      .then(({ error }) => {
        if (error) setNotifications((current) => current.map((notification) =>
          notification.id === id ? { ...notification, read: false, readAt: null } : notification));
      });
  }, [customerId, notifications]);

  const markAllAsRead = useCallback(() => {
    const unreadIds = new Set(notifications.filter((notification) => !notification.read).map((notification) => notification.id));
    if (!unreadIds.size) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((notification) =>
      unreadIds.has(notification.id) ? { ...notification, read: true, readAt } : notification));
    if (!customerId) return;

    void supabase
      .from("customer_notifications")
      .update({ is_read: true })
      .eq("customer_id", customerId)
      .eq("is_read", false)
      .then(({ error }) => {
        if (error) setNotifications((current) => current.map((notification) =>
          unreadIds.has(notification.id) ? { ...notification, read: false, readAt: null } : notification));
      });
  }, [customerId, notifications]);

  const clearNotifications = useCallback(() => {
    const previous = notifications;
    setNotifications([]);
    if (!customerId) return;
    void supabase
      .from("customer_notifications")
      .delete()
      .eq("customer_id", customerId)
      .then(({ error }) => {
        if (error) setNotifications(previous);
      });
  }, [customerId, notifications]);

  const unreadCount = useMemo(
    () => notifications.reduce((count, notification) => count + Number(!notification.read), 0),
    [notifications],
  );

  const value = useMemo<NotificationContextValue>(() => ({
    notifications,
    unreadCount,
    loading,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    refreshNotifications,
  }), [
    addNotification,
    clearNotifications,
    loading,
    markAllAsRead,
    markAsRead,
    notifications,
    refreshNotifications,
    unreadCount,
  ]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error("useNotifications must be used inside NotificationProvider.");
  return value;
}
