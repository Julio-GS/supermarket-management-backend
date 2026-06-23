import { Injectable } from "@nestjs/common";
import { ReadCachePort } from "./read-cache.port";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class InMemoryReadCache extends ReadCachePort {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  async getOrSet<T>(
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
  ): Promise<T> {
    if (ttlMs <= 0) return load();

    const now = Date.now();
    const cached = this.entries.get(key) as CacheEntry<T> | undefined;
    if (cached && cached.expiresAt > now) return cached.value;

    const value = await load();
    this.entries.set(key, { value, expiresAt: now + ttlMs });
    return value;
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }
  }
}
