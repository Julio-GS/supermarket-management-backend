import { buildCacheKey } from "./cache-key";
import { InMemoryReadCache } from "./in-memory-read-cache";

describe("InMemoryReadCache", () => {
  it("reuses cached values while TTL is valid", async () => {
    const cache = new InMemoryReadCache();
    const load = jest.fn().mockResolvedValue("loaded");

    await expect(
      cache.getOrSet("products:v1:list:a", 1_000, load),
    ).resolves.toBe("loaded");
    await expect(
      cache.getOrSet("products:v1:list:a", 1_000, load),
    ).resolves.toBe("loaded");

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads values after prefix invalidation", async () => {
    const cache = new InMemoryReadCache();
    const load = jest
      .fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second");

    await expect(
      cache.getOrSet("products:v1:list:a", 1_000, load),
    ).resolves.toBe("first");
    await cache.deleteByPrefix("products:v1");
    await expect(
      cache.getOrSet("products:v1:list:a", 1_000, load),
    ).resolves.toBe("second");
  });

  it("uses stable cache keys for equivalent params", () => {
    expect(buildCacheKey("products:v1", "list", { page: 1, limit: 20 })).toBe(
      buildCacheKey("products:v1", "list", { limit: 20, page: 1 }),
    );
  });

  // ── concurrency: same-key deduplication ──

  it("deduplicates concurrent same-key misses — invokes loader once", async () => {
    const cache = new InMemoryReadCache();
    let resolveLoad!: (value: string) => void;
    const load = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveLoad = resolve;
        }),
    );

    const first = cache.getOrSet("products:v1:detail:1", 1_000, load);
    const second = cache.getOrSet("products:v1:detail:1", 1_000, jest.fn());

    expect(load).toHaveBeenCalledTimes(1);

    resolveLoad("shared-value");
    await expect(Promise.all([first, second])).resolves.toEqual([
      "shared-value",
      "shared-value",
    ]);
  });

  it("returns cached value on sequential call after resolution", async () => {
    const cache = new InMemoryReadCache();
    const loadA = jest.fn().mockResolvedValue("first");
    const loadB = jest.fn().mockResolvedValue("second");

    await cache.getOrSet("reports:v1:day", 1_000, loadA);
    const result = await cache.getOrSet("reports:v1:day", 1_000, loadB);

    expect(result).toBe("first");
    expect(loadA).toHaveBeenCalledTimes(1);
    expect(loadB).not.toHaveBeenCalled();
  });

  it("loads distinct concurrent keys independently", async () => {
    const cache = new InMemoryReadCache();
    let resolveA!: (v: string) => void;
    let resolveB!: (v: string) => void;
    const loadA = jest.fn(
      () =>
        new Promise<string>((r) => {
          resolveA = r;
        }),
    );
    const loadB = jest.fn(
      () =>
        new Promise<string>((r) => {
          resolveB = r;
        }),
    );

    const pA = cache.getOrSet("products:v1:detail:A", 1_000, loadA);
    const pB = cache.getOrSet("products:v1:detail:B", 1_000, loadB);

    expect(loadA).toHaveBeenCalledTimes(1);
    expect(loadB).toHaveBeenCalledTimes(1);

    resolveA("value-A");
    resolveB("value-B");

    await expect(pA).resolves.toBe("value-A");
    await expect(pB).resolves.toBe("value-B");
  });

  // ── failure recovery ──

  it("does not cache a rejected loader and allows retry", async () => {
    const cache = new InMemoryReadCache();
    const failing = jest.fn().mockRejectedValue(new Error("boom"));
    const succeeding = jest.fn().mockResolvedValue("recovered");

    await expect(
      cache.getOrSet("products:v1:list", 1_000, failing),
    ).rejects.toThrow("boom");

    const result = await cache.getOrSet("products:v1:list", 1_000, succeeding);
    expect(result).toBe("recovered");
    expect(succeeding).toHaveBeenCalledTimes(1);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it("concurrent same-key failure shares rejection and allows later fresh loader", async () => {
    const cache = new InMemoryReadCache();
    const failing = jest.fn().mockRejectedValue(new Error("shared-failure"));

    const first = cache.getOrSet("key-x", 1_000, failing);
    const second = cache.getOrSet("key-x", 1_000, jest.fn());

    await expect(first).rejects.toThrow("shared-failure");
    await expect(second).rejects.toThrow("shared-failure");
    expect(failing).toHaveBeenCalledTimes(1);

    // Subsequent call after failure should trigger a fresh loader
    const succeeding = jest.fn().mockResolvedValue("recovered");
    const result = await cache.getOrSet("key-x", 1_000, succeeding);
    expect(result).toBe("recovered");
    expect(succeeding).toHaveBeenCalledTimes(1);
  });

  it("failed loader for one key does not affect another key", async () => {
    const cache = new InMemoryReadCache();
    const failing = jest.fn().mockRejectedValue(new Error("boom"));
    const succeeding = jest.fn().mockResolvedValue("ok");

    await expect(
      cache.getOrSet("key-A", 1_000, failing),
    ).rejects.toThrow("boom");

    const result = await cache.getOrSet("key-B", 1_000, succeeding);
    expect(result).toBe("ok");
    expect(succeeding).toHaveBeenCalledTimes(1);
  });

  // ── prefix-invalidation race prevention ──

  it("prefix invalidation during in-flight load prevents stale repopulation", async () => {
    const cache = new InMemoryReadCache();
    let resolveSlow!: (v: string) => void;
    const slowLoad = jest.fn(
      () =>
        new Promise<string>((r) => {
          resolveSlow = r;
        }),
    );

    const p1 = cache.getOrSet("products:v1:detail:1", 1_000, slowLoad);
    await cache.deleteByPrefix("products:v1");
    resolveSlow("stale-value");
    await p1;

    // The stale value must not be stored after invalidation
    const freshLoad = jest.fn().mockResolvedValue("fresh-value");
    const result = await cache.getOrSet(
      "products:v1:detail:1",
      1_000,
      freshLoad,
    );
    expect(result).toBe("fresh-value");
    expect(freshLoad).toHaveBeenCalledTimes(1);
  });

  it("non-matching in-flight key is unaffected by prefix invalidation", async () => {
    const cache = new InMemoryReadCache();
    let resolveReports!: (v: string) => void;
    const reportsLoad = jest.fn(
      () =>
        new Promise<string>((r) => {
          resolveReports = r;
        }),
    );
    let resolveProducts!: (v: string) => void;
    const productsLoad = jest.fn(
      () =>
        new Promise<string>((r) => {
          resolveProducts = r;
        }),
    );

    const pReports = cache.getOrSet("reports:v1:day", 1_000, reportsLoad);
    const pProducts = cache.getOrSet(
      "products:v1:detail:2",
      1_000,
      productsLoad,
    );

    await cache.deleteByPrefix("products:v1");
    resolveReports("reports-ok");
    resolveProducts("products-stale");

    // Reports key was not invalidated — its value should be stored
    await expect(pReports).resolves.toBe("reports-ok");
    // Products key was invalidated — its stale value should be discarded before storage
    await expect(pProducts).resolves.toBe("products-stale");

    // Verify: reports stored, products stale discarded
    const reportsAgain = jest.fn();
    const productsAgain = jest.fn().mockResolvedValue("products-fresh");

    const r1 = await cache.getOrSet("reports:v1:day", 1_000, reportsAgain);
    expect(r1).toBe("reports-ok");
    expect(reportsAgain).not.toHaveBeenCalled();

    const r2 = await cache.getOrSet(
      "products:v1:detail:2",
      1_000,
      productsAgain,
    );
    expect(r2).toBe("products-fresh");
    expect(productsAgain).toHaveBeenCalledTimes(1);
  });

  // ── TTL preservation ──

  it("preserves TTL expiration — expired entry triggers fresh load", async () => {
    const cache = new InMemoryReadCache();
    const loadA = jest.fn().mockResolvedValue("first");
    const loadB = jest.fn().mockResolvedValue("second");

    await cache.getOrSet("key-ttl", 10, loadA);

    // Advance time past the 10 ms TTL
    await new Promise((r) => setTimeout(r, 15));

    const result = await cache.getOrSet("key-ttl", 10, loadB);
    expect(result).toBe("second");
    expect(loadA).toHaveBeenCalledTimes(1);
    expect(loadB).toHaveBeenCalledTimes(1);
  });

  it("bypasses cache when ttlMs <= 0", async () => {
    const cache = new InMemoryReadCache();
    const load = jest.fn().mockResolvedValue("direct");

    await cache.getOrSet("any-key", 0, load);
    await cache.getOrSet("any-key", 0, load);

    // Both calls bypass the cache entirely
    expect(load).toHaveBeenCalledTimes(2);
  });
});
