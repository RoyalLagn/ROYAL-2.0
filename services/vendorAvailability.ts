import { supabase } from "@/services/supabase";

export type AvailabilityStatus = "available" | "tentative" | "blocked";
export type EffectiveAvailabilityDay = {
  date: string;
  status: AvailabilityStatus;
  isException: boolean;
  bookingBlocked: boolean;
};

export function effectiveAvailabilityStatus(
  exceptions: readonly { date: string; status: AvailabilityStatus }[],
  date: string,
  today = new Date().toISOString().slice(0, 10),
): AvailabilityStatus | "past" {
  if (date < today) return "past";
  return exceptions.find((item) => item.date === date)?.status ?? "available";
}

export async function listEffectiveVendorAvailability(
  vendorId: string,
  startDate: string,
  endDate: string,
): Promise<EffectiveAvailabilityDay[]> {
  const { data, error } = await supabase.rpc("get_vendor_availability_calendar", {
    target_vendor_id: vendorId,
    start_date: startDate,
    end_date: endDate,
  });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    date: String(row.date),
    status: row.status as AvailabilityStatus,
    isException: Boolean(row.is_exception),
    bookingBlocked: Boolean(row.booking_blocked),
  }));
}

export async function setVendorAvailabilityException(
  vendorId: string,
  date: string,
  status: AvailabilityStatus,
) {
  const { error } = await supabase.rpc("set_vendor_availability_exception", {
    target_vendor_id: vendorId,
    target_date: date,
    next_status: status,
  });
  if (error) throw error;
}
