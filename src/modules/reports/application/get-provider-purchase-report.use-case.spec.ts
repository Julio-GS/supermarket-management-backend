import { GetProviderPurchaseReportUseCase } from "./get-provider-purchase-report.use-case";
import { ProviderPurchaseRepositoryPort } from "./provider-purchase.repository.port";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { ValidationError } from "../../../shared/errors/domain.error";

function makeAggregate(overrides: Record<string, unknown> = {}) {
  return {
    totalAmount: "1000.00",
    purchaseCount: 5,
    paymentMethodBreakdown: [
      { method: "cash", amount: "600.00" },
      { method: "transfer", amount: "400.00" },
    ],
    ...overrides,
  };
}

describe("GetProviderPurchaseReportUseCase", () => {
  let repo: jest.Mocked<ProviderPurchaseRepositoryPort>;
  let cache: jest.Mocked<ReadCachePort>;
  let useCase: GetProviderPurchaseReportUseCase;

  beforeEach(() => {
    repo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregateByProvider: jest.fn(),
    } as unknown as jest.Mocked<ProviderPurchaseRepositoryPort>;

    cache = {
      getOrSet: jest.fn(
        <T>(_key: string, _ttl: number, load: () => Promise<T>) => load(),
      ),
      deleteByPrefix: jest.fn(),
    } as unknown as jest.Mocked<ReadCachePort>;

    useCase = new GetProviderPurchaseReportUseCase(repo, cache);
  });

  beforeAll(() => {
    jest.useFakeTimers();
    // 2026-07-02T15:00:00Z = 2026-07-02T12:00:00-03:00 (ARG Thursday)
    jest.setSystemTime(new Date("2026-07-02T15:00:00.000Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("throws ValidationError for unsupported window", async () => {
    await expect(
      useCase.execute("year" as unknown as "day"),
    ).rejects.toThrow(ValidationError);
  });

  it("returns day report with correct window field", async () => {
    repo.aggregateByProvider.mockResolvedValue(makeAggregate());

    const result = await useCase.execute("day");

    expect(result.window).toBe("day");
    expect(result.totalAmount).toBe("1000.00");
    expect(result.purchaseCount).toBe(5);
  });

  it("returns week report with correct window field", async () => {
    repo.aggregateByProvider.mockResolvedValue(makeAggregate());

    const result = await useCase.execute("week");

    expect(result.window).toBe("week");
  });

  it("returns month report with correct window field", async () => {
    repo.aggregateByProvider.mockResolvedValue(makeAggregate());

    const result = await useCase.execute("month");

    expect(result.window).toBe("month");
  });

  it("resolves day boundaries in ARG timezone (2026-07-02)", async () => {
    repo.aggregateByProvider.mockResolvedValue(makeAggregate());

    const result = await useCase.execute("day");

    expect(result.range.startsAt).toContain("2026-07-02T00:00:00");
    expect(result.range.endsAt).toContain("2026-07-02T23:59:59");
  });

  it("resolves week boundaries covering Mon 2026-06-29 to Sun 2026-07-05", async () => {
    repo.aggregateByProvider.mockResolvedValue(makeAggregate());

    const result = await useCase.execute("week");

    expect(result.range.startsAt).toContain("2026-06-29T00:00:00");
    expect(result.range.endsAt).toContain("2026-07-05T23:59:59");
  });

  it("resolves month boundaries covering Jul 2026", async () => {
    repo.aggregateByProvider.mockResolvedValue(makeAggregate());

    const result = await useCase.execute("month");

    expect(result.range.startsAt).toContain("2026-07-01T00:00:00");
    expect(result.range.endsAt).toContain("2026-07-31T23:59:59");
  });

  it("caches report reads with correct key prefix and TTL", async () => {
    repo.aggregateByProvider.mockResolvedValue(makeAggregate());

    await useCase.execute("day");

    expect(cache.getOrSet).toHaveBeenCalledWith(
      expect.stringContaining("reports:v1:provider-purchase:"),
      60_000,
      expect.any(Function),
    );
  });

  it("delegates to repository with computed date boundaries", async () => {
    repo.aggregateByProvider.mockResolvedValue(makeAggregate());

    await useCase.execute("day");

    expect(repo.aggregateByProvider).toHaveBeenCalledTimes(1);
    const [startsAt, endsAt] =
      repo.aggregateByProvider.mock.calls[0] as [Date, Date];
    expect(startsAt).toBeInstanceOf(Date);
    expect(endsAt).toBeInstanceOf(Date);
  });

  it("returns empty payment breakdown when no data", async () => {
    repo.aggregateByProvider.mockResolvedValue(
      makeAggregate({
        totalAmount: "0.00",
        purchaseCount: 0,
        paymentMethodBreakdown: [],
      }),
    );

    const result = await useCase.execute("day");

    expect(result.totalAmount).toBe("0.00");
    expect(result.purchaseCount).toBe(0);
    expect(result.paymentMethodBreakdown).toEqual([]);
  });
});
