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
  refresh: () => Promise<void>;
  markAsRead: (id: string) => Promise<boolean>;
  markAllAsRead: () => Promise<boolean>;
};

const VendorNotificationContext = createContext<VendorNotificationContextValue | null>(null);
let vendorNotificationChannelSequence = 0;

export function VendorNotificationProvider({ children }: React.PropsWithChildren) {
  const { isPreviewMode, workspaceEpoch } = useVendorSession();
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<VendorNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  const refreshRequest = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    const request = ++refreshRequest.current;
    if (isPreviewMode) {
      if (mounted.current) {
        setVendorId(null);
        setNotifications([]);
        setLoading(false);
      }
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      if (mounted.current && request === refreshRequest.current) {
        setVendorId(null);
        setNotifications([]);
        setLoading(false);
      }
      return;
    }

    if (mounted.current) {
      setVendorId(null);
      setNotifications([]);
      setLoading(true);
    }
    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("id")
      .eq("profile_id", authData.user.id)
      .maybeSingle();

    if (request !== refreshRequest.current) return;
    if (vendorError || !vendor) {
      if (mounted.current) {
        setVendorId(null);
        setNotifications([]);
        setLoading(false);
      }
      return;
    }

    const { data: rows, error } = await supabase
      .from("vendor_notifications")
      .select("*")
      .eq("vendor_id", vendor.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!mounted.current || request !== refreshRequest.current) return;
    setVendorId(vendor.id);
    if (!error) setNotifications((rows ?? []) as VendorNotification[]);
    setLoading(false);
  }, [isPreviewMode]);

  useEffect(() => { void refresh(); }, [refresh, workspaceEpoch]);

  useEffect(() => {
    if (!vendorId) return;
    vendorNotificationChannelSequence += 1;
    const channel = supabase
      .channel(`vendor-notifications-${vendorId}-${vendorNotificationChannelSequence}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vendor_notifications", filter: `vendor_id=eq.${vendorId}` },
        () => { void refresh(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refresh, vendorId]);

  const markAsRead = useCallback(async (id: string) => {
    const target = notifications.find((notification) => notification.id === id);
    if (!target || target.is_read) return true;
    if (!vendorId) return false;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((notification) => {
      if (notification.id !== id || notification.is_read) return notification;
      return { ...notification, is_read: true, read_at: readAt };
    }));

    const { error } = await supabase
      .from("vendor_notifications")
      .update({ is_read: true })
      .eq("vendor_id", vendorId)
      .eq("id", id);
    if (!error) return true;

    setNotifications((current) => current.map((notification) =>
      notification.id === id ? { ...notification, is_read: false, read_at: null } : notification));
    return false;
  }, [notifications, vendorId]);

  const markAllAsRead = useCallback(async () => {
    if (!vendorId) return false;
    const unreadIds = new Set(notifications.filter((item) => !item.is_read).map((item) => item.id));
    if (!unreadIds.size) return true;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((notification) =>
      unreadIds.has(notification.id) ? { ...notification, is_read: true, read_at: readAt } : notification));

    const { error } = await supabase
      .from("vendor_notifications")
      .update({ is_read: true })
      .eq("vendor_id", vendorId)
      .eq("is_read", false);
    if (!error) return true;

    setNotifications((current) => current.map((notification) =>
      unreadIds.has(notification.id) ? { ...notification, is_read: false, read_at: null } : notification));
    return false;
  }, [notifications, vendorId]);

  const unreadCount = useMemo(
    () => notifications.reduce((count, notification) => count + Number(!notification.is_read), 0),
    [notifications],
  );

  const value = useMemo<VendorNotificationContextValue>(() => ({
    notifications,
    unreadCount,
    loading,
    refresh,
    markAsRead,
    markAllAsRead,
  }), [loading, markAllAsRead, markAsRead, notifications, refresh, unreadCount]);

  return <VendorNotificationContext.Provider value={value}>{children}</VendorNotificationContext.Provider>;
}

export function useVendorNotifications() {
  const value = useContext(VendorNotificationContext);
  if (!value) throw new Error("useVendorNotifications must be used inside VendorNotificationProvider.");
  return value;
}
