import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { VendorFilters } from "@/types/adminVendors";

const KEY = "royallagn.admin.vendor.savedFilters";
export type SavedVendorFilter = { id: string; name: string; filters: VendorFilters };

async function read() {
  if (Platform.OS === "web") return typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
  return SecureStore.getItemAsync(KEY);
}
async function write(value: string) {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") localStorage.setItem(KEY, value);
    return;
  }
  await SecureStore.setItemAsync(KEY, value);
}
async function clear() {
  if (Platform.OS === "web") {
    if (typeof localStorage !== "undefined") localStorage.removeItem(KEY);
    return;
  }
  await SecureStore.deleteItemAsync(KEY);
}

export const AdminPreferences = {
  clear,
  async listVendorFilters(): Promise<SavedVendorFilter[]> {
    try { return JSON.parse((await read()) || "[]") as SavedVendorFilter[]; }
    catch { return []; }
  },
  async saveVendorFilter(name: string, filters: VendorFilters) {
    const current = await this.listVendorFilters();
    const next = [
      ...current.filter((item) => item.name.toLowerCase() !== name.trim().toLowerCase()),
      { id: `${Date.now()}`, name: name.trim(), filters: { ...filters, page: 1 } },
    ];
    await write(JSON.stringify(next));
    return next;
  },
  async removeVendorFilter(id: string) {
    const next = (await this.listVendorFilters()).filter((item) => item.id !== id);
    await write(JSON.stringify(next));
    return next;
  },
};
