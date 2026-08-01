import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ClipDraftRecord } from "../types";

const KEY = "@royallagn/clips/drafts/v1";

async function readAll(): Promise<ClipDraftRecord[]> {
  const stored = await AsyncStorage.getItem(KEY);
  if (!stored) return [];
  try {
    const value = JSON.parse(stored);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export const ClipDraftService = {
  list: readAll,
  clear: () => AsyncStorage.removeItem(KEY),
  async save(draft: ClipDraftRecord) {
    const items = await readAll();
    const next = [draft, ...items.filter((item) => item.id !== draft.id)];
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    return draft;
  },
  async remove(id: string) {
    const items = await readAll();
    await AsyncStorage.setItem(KEY, JSON.stringify(items.filter((item) => item.id !== id)));
  },
};
