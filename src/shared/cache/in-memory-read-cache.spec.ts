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
});
