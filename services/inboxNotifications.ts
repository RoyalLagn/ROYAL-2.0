import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from "@/services/supabase";

export type CustomerInboxRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  target_path: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export type VendorInboxRow = {
  id: string;
  vendor_id: string;
  title: string;
  body: string | null;
  kind: string;
  target_path: string | null;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export const CustomerInboxService = {
  async send(params: {
    customerId: string;
    type?: string;
    title: string;
    message: string;
    targetPath?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(params.customerId);
    const now = new Date().toISOString();
    const id = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : ("notif_" + Date.now());

    if (isUuid) {
      try {
        await supabase.from("customer_notifications").insert({
          customer_id: params.customerId,
          type: params.type || "booking_update",
          title: params.title,
          message: params.message,
          target_path: params.targetPath || null,
          metadata: params.metadata || {},
        });
      } catch (err) {
        console.warn("Could not insert customer notification to Supabase", err);
      }
    }

    try {
      const storageKey = "@royal_customer_notifs_" + params.customerId;
      const raw = await AsyncStorage.getItem(storageKey);
      const existing: CustomerInboxRow[] = raw ? JSON.parse(raw) : [];
      const newRow: CustomerInboxRow = {
        id,
        type: params.type || "booking_update",
        title: params.title,
        message: params.message,
        target_path: params.targetPath || null,
        is_read: false,
        read_at: null,
        created_at: now,
      };
      await AsyncStorage.setItem(storageKey, JSON.stringify([newRow, ...existing]));
    } catch {
      // ignore
    }
  },

  async list(customerId: string, limit = 100) {
    const { data, error } = await supabase
      .from("customer_notifications")
      .select("id,type,title,message,target_path,is_read,read_at,created_at")
      .eq("customer_id", customerId)
      .order("is_read", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as CustomerInboxRow[];
  },

  async markRead(customerId: string, id: string) {
    const { error } = await supabase
      .from("customer_notifications")
      .update({ is_read: true })
      .eq("customer_id", customerId)
      .eq("id", id)
      .eq("is_read", false);
    if (error) throw error;
  },

  async markAllRead(customerId: string) {
    const { error } = await supabase
      .from("customer_notifications")
      .update({ is_read: true })
      .eq("customer_id", customerId)
      .eq("is_read", false);
    if (error) throw error;
  },

  async remove(customerId: string, id: string) {
    const { error } = await supabase
      .from("customer_notifications")
      .delete()
      .eq("customer_id", customerId)
      .eq("id", id);
    if (error) throw error;
  },

  async clearAll(customerId: string) {
    const { error } = await supabase
      .from("customer_notifications")
      .delete()
      .eq("customer_id", customerId);
    if (error) throw error;
  },
};

export const VendorInboxService = {
  async list(vendorId: string, limit = 100) {
    const { data, error } = await supabase
      .from("vendor_notifications")
      .select("id,vendor_id,title,body,kind,target_path,metadata,is_read,read_at,created_at")
      .eq("vendor_id", vendorId)
      .order("is_read", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as VendorInboxRow[];
  },

  async markRead(vendorId: string, id: string) {
    const { error } = await supabase
      .from("vendor_notifications")
      .update({ is_read: true })
      .eq("vendor_id", vendorId)
      .eq("id", id)
      .eq("is_read", false);
    if (error) throw error;
  },

  async markAllRead(vendorId: string) {
    const { error } = await supabase
      .from("vendor_notifications")
      .update({ is_read: true })
      .eq("vendor_id", vendorId)
      .eq("is_read", false);
    if (error) throw error;
  },

  async remove(vendorId: string, id: string) {
    const { error } = await supabase
      .from("vendor_notifications")
      .delete()
      .eq("vendor_id", vendorId)
      .eq("id", id);
    if (error) throw error;
  },

  async clearAll(vendorId: string) {
    const { error } = await supabase
      .from("vendor_notifications")
      .delete()
      .eq("vendor_id", vendorId);
    if (error) throw error;
  },

  async clearRead(vendorId: string) {
    const { error } = await supabase
      .from("vendor_notifications")
      .delete()
      .eq("vendor_id", vendorId)
      .eq("is_read", true);
    if (error) throw error;
  },
};
