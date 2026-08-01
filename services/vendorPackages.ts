import { supabase } from "@/services/supabase";
import { validateVendorPackage } from "@/packages/validation";
export { validateVendorPackage } from "@/packages/validation";

export type VendorPackageStatus = "draft" | "active" | "inactive";
export type VendorPackagePriceType = "starting" | "fixed" | "contact";
export type VendorPackageItemType = "included" | "excluded" | "add_on";

export type VendorPackageItem = {
  id?: string;
  item_type: VendorPackageItemType;
  title: string;
  description?: string | null;
  price?: number | null;
  display_order?: number;
};

export type VendorPackage = {
  id: string;
  vendor_id: string;
  title: string;
  description: string | null;
  price: number | null;
  discounted_price: number | null;
  price_type: VendorPackagePriceType;
  service_category: string | null;
  duration_label: string | null;
  events_covered: number | null;
  delivery_details: string | null;
  terms: string | null;
  status: VendorPackageStatus;
  is_active: boolean;
  display_order: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  items: VendorPackageItem[];
};

export type VendorPackageInput = Omit<
  VendorPackage,
  "id" | "is_active" | "display_order" | "image_url" | "created_at" | "updated_at"
>;

const PACKAGE_SELECT = `
  id,vendor_id,title,description,price,discounted_price,price_type,
  service_category,duration_label,events_covered,delivery_details,terms,
  status,is_active,display_order,image_url,created_at,updated_at,
  items:vendor_service_items(id,item_type,title,description,price,display_order)
`;

function mapPackage(row: any): VendorPackage {
  return {
    ...row,
    price: row.price == null ? null : Number(row.price),
    discounted_price: row.discounted_price == null ? null : Number(row.discounted_price),
    events_covered: row.events_covered == null ? null : Number(row.events_covered),
    display_order: Number(row.display_order ?? 0),
    items: (row.items ?? [])
      .map((item: any) => ({
        ...item,
        price: item.price == null ? null : Number(item.price),
        display_order: Number(item.display_order ?? 0),
      }))
      .sort((a: VendorPackageItem, b: VendorPackageItem) => Number(a.display_order) - Number(b.display_order)),
  } as VendorPackage;
}

export const VendorPackageService = {
  async listPublic(vendorId: string): Promise<VendorPackage[]> {
    const { data, error } = await supabase
      .from("vendor_services")
      .select(PACKAGE_SELECT)
      .eq("vendor_id", vendorId)
      .eq("status", "active")
      .eq("is_active", true)
      .order("display_order")
      .order("created_at");
    if (error) throw error;
    return (data ?? []).map(mapPackage);
  },

  async listVendor(vendorId: string): Promise<VendorPackage[]> {
    const { data, error } = await supabase
      .from("vendor_services")
      .select(PACKAGE_SELECT)
      .eq("vendor_id", vendorId)
      .order("display_order")
      .order("created_at");
    if (error) throw error;
    return (data ?? []).map(mapPackage);
  },

  async save(input: VendorPackageInput, packageId?: string | null) {
    const errors = validateVendorPackage(input);
    if (errors.length) throw new Error(errors[0]);
    const { data, error } = await supabase.rpc("save_vendor_package", {
      target_package_id: packageId ?? null,
      package_data: {
        vendor_id: input.vendor_id,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        price: input.price,
        discounted_price: input.discounted_price,
        price_type: input.price_type,
        service_category: input.service_category?.trim() || null,
        duration_label: input.duration_label?.trim() || null,
        events_covered: input.events_covered,
        delivery_details: input.delivery_details?.trim() || null,
        terms: input.terms?.trim() || null,
        status: input.status,
      },
      package_items: input.items.map((item) => ({
        item_type: item.item_type,
        title: item.title.trim(),
        description: item.description?.trim() || null,
        price: item.item_type === "add_on" ? item.price ?? null : null,
      })),
    });
    if (error) throw error;
    return String(data);
  },

  async setStatus(packageId: string, vendorId: string, status: VendorPackageStatus) {
    const { data, error } = await supabase
      .from("vendor_services")
      .update({ status, is_active: status === "active" })
      .eq("id", packageId)
      .eq("vendor_id", vendorId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Package not found or you do not have permission to update it.");
  },

  async remove(packageId: string, vendorId: string) {
    const { data, error } = await supabase
      .from("vendor_services")
      .delete()
      .eq("id", packageId)
      .eq("vendor_id", vendorId)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Package not found or you do not have permission to delete it.");
  },

  async reorder(vendorId: string, orderedPackageIds: string[]) {
    const { error } = await supabase.rpc("reorder_vendor_packages", {
      target_vendor_id: vendorId,
      ordered_package_ids: orderedPackageIds,
    });
    if (error) throw error;
  },

  subscribe(vendorId: string, onChange: () => void) {
    const channel = supabase.channel(`vendor-packages-${vendorId}-${Date.now()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendor_services", filter: `vendor_id=eq.${vendorId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendor_service_items" }, onChange)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  },
};
