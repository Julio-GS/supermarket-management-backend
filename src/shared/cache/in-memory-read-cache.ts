import { Injectable } from "@nestjs/common";
import { ReadCachePort } from "./read-cache.port";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class InMemoryReadCache extends ReadCachePort {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly prefixGenerations = new Map<string, number>();

  async getOrSet<T>(
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
  ): Promise<T> {
    if (ttlMs <= 0) return load();

    const now = Date.now();
    const cached = this.entries.get(key) as CacheEntry<T> | undefined;
    if (cached && cached.expiresAt > now) return cached.value;

    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;

    const generationSnapshot = this.snapshotGenerationsFor(key);

    const promise = this.wrapInFlight(key, ttlMs, now, load, generationSnapshot);
    this.inFlight.set(key, promise);
    return promise as Promise<T>;
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    const current = this.prefixGenerations.get(prefix) ?? 0;
    this.prefixGenerations.set(prefix, current + 1);

    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key);
    }

    for (const key of this.inFlight.keys()) {
      if (key.startsWith(prefix)) this.inFlight.delete(key);
    }
  }

  // ── private helpers ──

  private snapshotGenerationsFor(key: string): Map<string, number> {
    const snapshot = new Map<string, number>();
    for (const [prefix, generation] of this.prefixGenerations) {
      if (key.startsWith(prefix)) snapshot.set(prefix, generation);
    }
    return snapshot;
  }

  private isGenerationCurrentFor(
    key: string,
    snapshot: Map<string, number>,
  ): boolean {
    for (const [prefix, current] of this.prefixGenerations) {
      if (key.startsWith(prefix) && snapshot.get(prefix) !== current) {
        return false;
      }
    }
    return true;
  }

  private wrapInFlight<T>(
    key: string,
    ttlMs: number,
    now: number,
    load: () => Promise<T>,
    generationSnapshot: Map<string, number>,
  ): Promise<T> {
    const promise = load()
      .then((value) => {
        if (this.isGenerationCurrentFor(key, generationSnapshot)) {
          this.entries.set(key, { value, expiresAt: now + ttlMs });
        }
        return value;
      })
      .finally(() => {
        if (this.inFlight.get(key) === promise) {
          this.inFlight.delete(key);
        }
      });

    return promise;
  }
}
