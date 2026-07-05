import { GetBusinessReportUseCase } from "./get-business-report.use-case";
import { ReportRepositoryPort } from "./report.repository.port";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { ValidationError } from "../../../shared/errors/domain.error";
import { ReportAggregateData } from "../domain/report.entity";

function makeAggregate(
  overrides: Partial<ReportAggregateData> = {},
): ReportAggregateData {
  return {
    totalCollectedAmount: "1000.00",
    paymentMethodBreakdown: [
      { method: "cash", amount: "600.00" },
      { method: "card", amount: "400.00" },
    ],
    topProducts: [
      { productId: "p1", detalle: "Milk", unitsSold: 10 },
      { productId: "p2", detalle: "Bread", unitsSold: 5 },
    ],
    ...overrides,
  };
}

describe("GetBusinessReportUseCase", () => {
  let reportRepo: jest.Mocked<ReportRepositoryPort>;
  let cache: jest.Mocked<ReadCachePort>;
  let useCase: GetBusinessReportUseCase;

  beforeEach(() => {
    reportRepo = {
      getBusinessReport: jest.fn(),
    } as unknown as jest.Mocked<ReportRepositoryPort>;

    cache = {
      getOrSet: jest.fn(
        <T>(_key: string, _ttl: number, load: () => Promise<T>) => load(),
      ),
      deleteByPrefix: jest.fn(),
    } as unknown as jest.Mocked<ReadCachePort>;

    useCase = new GetBusinessReportUseCase(reportRepo, cache);
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
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute("day");

    expect(result.window).toBe("day");
    expect(result.totalCollectedAmount).toBe("1000.00");
  });

  it("returns week report with correct window field", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute("week");

    expect(result.window).toBe("week");
  });

  it("returns month report with correct window field", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute("month");

    expect(result.window).toBe("month");
  });

  it("resolves day boundaries in ARG timezone (2026-07-02)", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute("day");

    expect(result.range.startsAt).toContain("2026-07-02T00:00:00");
    expect(result.range.endsAt).toContain("2026-07-02T23:59:59");
  });

  it("resolves week boundaries covering Mon 2026-06-29 to Sun 2026-07-05", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute("week");

    // Thursday 2026-07-02 -> week starts Monday 2026-06-29
    expect(result.range.startsAt).toContain("2026-06-29T00:00:00");
    expect(result.range.endsAt).toContain("2026-07-05T23:59:59");
  });

  it("resolves month boundaries covering Jul 2026", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute("month");

    expect(result.range.startsAt).toContain("2026-07-01T00:00:00");
    expect(result.range.endsAt).toContain("2026-07-31T23:59:59");
  });

  it("caches report reads with the correct key prefix and TTL", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    await useCase.execute("day");

    expect(cache.getOrSet).toHaveBeenCalledWith(
      expect.stringContaining("reports:v1:business:"),
      60_000,
      expect.any(Function),
    );
  });

  it("delegates to repository with computed date boundaries", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    await useCase.execute("day");

    expect(reportRepo.getBusinessReport).toHaveBeenCalledTimes(1);
    const [startsAt, endsAt] =
      reportRepo.getBusinessReport.mock.calls[0] as [Date, Date];
    expect(startsAt).toBeInstanceOf(Date);
    expect(endsAt).toBeInstanceOf(Date);
  });

  it("limits top products to 10", async () => {
    const allProducts = Array.from({ length: 15 }, (_, i) => ({
      productId: `p${i}`,
      detalle: `Product ${i}`,
      unitsSold: 100 - i,
    }));
    reportRepo.getBusinessReport.mockResolvedValue(
      makeAggregate({ topProducts: allProducts }),
    );

    const result = await useCase.execute("day");

    expect(result.topProducts).toHaveLength(10);
    expect(result.topProducts[0].productId).toBe("p0");
  });

  it("returns empty payment method breakdown when no data", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(
      makeAggregate({
        totalCollectedAmount: "0.00",
        paymentMethodBreakdown: [],
        topProducts: [],
      }),
    );

    const result = await useCase.execute("day");

    expect(result.totalCollectedAmount).toBe("0.00");
    expect(result.paymentMethodBreakdown).toEqual([]);
    expect(result.topProducts).toEqual([]);
  });
});
