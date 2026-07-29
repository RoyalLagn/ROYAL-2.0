type CacheEntry<T> = { value: T; expiresAt: number };
export type ClipCacheNamespace = "feed" | "vendor" | "details" | "analytics";

class ClipCache {
  private entries = new Map<string, CacheEntry<unknown>>();

  private key(namespace: ClipCacheNamespace, id: string) {
    return `${namespace}:${id}`;
  }

  get<T>(namespace: ClipCacheNamespace, id: string): T | null {
    const key = this.key(namespace, id);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value as T;
  }

  set<T>(namespace: ClipCacheNamespace, id: string, value: T, ttlMs: number) {
    this.entries.set(this.key(namespace, id), { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(namespace?: ClipCacheNamespace, id?: string) {
    if (!namespace) return this.entries.clear();
    const prefix = `${namespace}:`;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix) && (!id || key === this.key(namespace, id))) {
        this.entries.delete(key);
      }
    }
  }
}

export const ClipCacheService = new ClipCache();
