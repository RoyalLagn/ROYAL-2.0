import { supabase } from "@/services/supabase";
import { verifyAdminSession } from "@/services/adminAuth";

export type AdminNotification = {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  target_path: string | null;
  application_id: string | null;
  deletion_request_id: string | null;
  is_read: boolean;
  created_at: string;
};

const columns = "id,title,body,kind,target_path,application_id,deletion_request_id,is_read,created_at";
let subscriptionSequence = 0;

export async function listAdminNotifications(): Promise<AdminNotification[]> {
  await verifyAdminSession();
  const { data, error } = await supabase.from("admin_notifications").select(columns).order("is_read", { ascending: true }).order("created_at", { ascending: false }).limit(100);
  if (error) throw error;
  return (data ?? []) as AdminNotification[];
}

export async function countUnreadAdminNotifications(): Promise<number> {
  const { count, error } = await supabase.from("admin_notifications").select("id", { count: "exact", head: true }).eq("is_read", false);
  if (error) throw error;
  return count ?? 0;
}

export async function markAdminNotificationRead(id: string) {
  const { error } = await supabase.from("admin_notifications").update({ is_read: true }).eq("id", id);
  if (error) throw error;
}

export async function markAllAdminNotificationsRead() {
  const { error } = await supabase.from("admin_notifications").update({ is_read: true }).eq("is_read", false);
  if (error) throw error;
}

export function subscribeToAdminNotifications(onChange: () => void) {
  subscriptionSequence += 1;
  const channel = supabase.channel(`admin-notification-inbox-${Date.now()}-${subscriptionSequence}`).on("postgres_changes", { event: "*", schema: "public", table: "admin_notifications" }, onChange).subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export function adminNotificationTarget(notification: AdminNotification): string | null {
  if (notification.kind === "vendor_deletion" && notification.deletion_request_id) return `/AdminVendorDeletionRequests?requestId=${notification.deletion_request_id}`;
  if (notification.application_id) return `/VendorApplicationDetails?id=${notification.application_id}`;
  return null;
}
