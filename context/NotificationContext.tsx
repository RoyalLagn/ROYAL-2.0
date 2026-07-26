import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

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
};

export type NewNotification = Omit<
  RoyalLagnNotification,
  "id" | "timestamp" | "read"
> & {
  id?: string;
  timestamp?: string;
  read?: boolean;
};

type NotificationContextValue = {
  notifications: RoyalLagnNotification[];
  unreadCount: number;
  addNotification: (notification: NewNotification) => string;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

const createLocalId = () =>
  `notification-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<RoyalLagnNotification[]>([]);

  const addNotification = useCallback((notification: NewNotification) => {
    const id = notification.id ?? createLocalId();
    const nextNotification: RoyalLagnNotification = {
      ...notification,
      id,
      timestamp: notification.timestamp ?? new Date().toISOString(),
      read: notification.read ?? false,
    };
    setNotifications((current) => [nextNotification, ...current]);
    return id;
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id && !notification.read
          ? { ...notification, read: true }
          : notification
      )
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((current) =>
      current.map((notification) =>
        notification.read ? notification : { ...notification, read: true }
      )
    );
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadCount = useMemo(
    () => notifications.reduce((count, notification) => count + Number(!notification.read), 0),
    [notifications]
  );

  const value = useMemo<NotificationContextValue>(() => ({
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearNotifications,
  }), [
    addNotification,
    clearNotifications,
    markAllAsRead,
    markAsRead,
    notifications,
    unreadCount,
  ]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error("useNotifications must be used inside NotificationProvider.");
  return value;
}
