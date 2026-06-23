export abstract class ReadCachePort {
  abstract getOrSet<T>(
    key: string,
    ttlMs: number,
    load: () => Promise<T>,
  ): Promise<T>;
  abstract deleteByPrefix(prefix: string): Promise<void>;
}
