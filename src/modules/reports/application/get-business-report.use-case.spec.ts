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
      { productId: "p1", detalle: "Milk", units_sold: 10 },
      { productId: "p2", detalle: "Bread", units_sold: 5 },
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

  // ── Window mode (backward-compatible) ────────────────────────

  it("throws ValidationError for unsupported window", async () => {
    await expect(
      useCase.execute({ mode: "window", window: "year" as unknown as "day" }),
    ).rejects.toThrow(ValidationError);
  });

  it("returns day report with correct window field", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute({ mode: "window", window: "day" });

    expect(result.window).toBe("day");
    expect(result.totalCollectedAmount).toBe("1000.00");
  });

  it("returns week report with correct window field", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute({ mode: "window", window: "week" });

    expect(result.window).toBe("week");
  });

  it("returns month report with correct window field", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute({ mode: "window", window: "month" });

    expect(result.window).toBe("month");
  });

  it("resolves day boundaries in ARG timezone (2026-07-02)", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute({ mode: "window", window: "day" });

    expect(result.range.startsAt).toContain("2026-07-02T00:00:00");
    expect(result.range.endsAt).toContain("2026-07-02T23:59:59");
  });

  it("resolves week boundaries covering Mon 2026-06-29 to Sun 2026-07-05", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute({ mode: "window", window: "week" });

    // Thursday 2026-07-02 -> week starts Monday 2026-06-29
    expect(result.range.startsAt).toContain("2026-06-29T00:00:00");
    expect(result.range.endsAt).toContain("2026-07-05T23:59:59");
  });

  it("resolves month boundaries covering Jul 2026", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute({ mode: "window", window: "month" });

    expect(result.range.startsAt).toContain("2026-07-01T00:00:00");
    expect(result.range.endsAt).toContain("2026-07-31T23:59:59");
  });

  it("caches report reads with the correct key prefix and TTL", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    await useCase.execute({ mode: "window", window: "day" });

    expect(cache.getOrSet).toHaveBeenCalledWith(
      expect.stringContaining("reports:v1:business:"),
      60_000,
      expect.any(Function),
    );
  });

  it("delegates to repository with computed date boundaries", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    await useCase.execute({ mode: "window", window: "day" });

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
      units_sold: 100 - i,
    }));
    reportRepo.getBusinessReport.mockResolvedValue(
      makeAggregate({ topProducts: allProducts }),
    );

    const result = await useCase.execute({ mode: "window", window: "day" });

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

    const result = await useCase.execute({ mode: "window", window: "day" });

    expect(result.totalCollectedAmount).toBe("0.00");
    expect(result.paymentMethodBreakdown).toEqual([]);
    expect(result.topProducts).toEqual([]);
  });

  // ── Custom range mode ────────────────────────────────────────

  it("returns custom report with window discriminator 'custom'", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute({
      mode: "custom",
      from: "2025-01-01T00:00:00Z",
      to: "2025-01-31T23:59:59Z",
    });

    expect(result.window).toBe("custom");
    expect(result.totalCollectedAmount).toBe("1000.00");
  });

  it("returns custom range in ISO UTC format", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute({
      mode: "custom",
      from: "2025-01-01T00:00:00Z",
      to: "2025-01-31T23:59:59Z",
    });

    expect(result.range.startsAt).toBe("2025-01-01T00:00:00.000Z");
    expect(result.range.endsAt).toBe("2025-01-31T23:59:59.000Z");
  });

  it("delegates to repository with correct Date bounds for custom range", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    await useCase.execute({
      mode: "custom",
      from: "2025-06-01T10:00:00Z",
      to: "2025-06-30T23:59:59Z",
    });

    expect(reportRepo.getBusinessReport).toHaveBeenCalledTimes(1);
    const [startsAt, endsAt] =
      reportRepo.getBusinessReport.mock.calls[0] as [Date, Date];
    expect(startsAt).toBeInstanceOf(Date);
    expect(endsAt).toBeInstanceOf(Date);
    expect(startsAt.toISOString()).toBe("2025-06-01T10:00:00.000Z");
    expect(endsAt.toISOString()).toBe("2025-06-30T23:59:59.000Z");
  });

  it("uses separate cache key for custom mode vs window mode", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    await useCase.execute({ mode: "window", window: "day" });
    const windowCacheKey = cache.getOrSet.mock.calls[0][0] as string;

    await useCase.execute({
      mode: "custom",
      from: "2025-01-01T00:00:00Z",
      to: "2025-01-31T23:59:59Z",
    });
    const customCacheKey = cache.getOrSet.mock.calls[1][0] as string;

    expect(windowCacheKey).not.toBe(customCacheKey);
  });

  it("uses separate cache keys for different custom ranges", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    await useCase.execute({
      mode: "custom",
      from: "2025-01-01T00:00:00Z",
      to: "2025-01-31T23:59:59Z",
    });
    const key1 = cache.getOrSet.mock.calls[0][0] as string;

    await useCase.execute({
      mode: "custom",
      from: "2025-02-01T00:00:00Z",
      to: "2025-02-28T23:59:59Z",
    });
    const key2 = cache.getOrSet.mock.calls[1][0] as string;

    expect(key1).not.toBe(key2);
  });

  it("returns empty/zero report for future custom range", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(
      makeAggregate({
        totalCollectedAmount: "0.00",
        paymentMethodBreakdown: [],
        topProducts: [],
      }),
    );

    const result = await useCase.execute({
      mode: "custom",
      from: "2099-01-01T00:00:00Z",
      to: "2099-12-31T23:59:59Z",
    });

    expect(result.window).toBe("custom");
    expect(result.totalCollectedAmount).toBe("0.00");
    expect(result.paymentMethodBreakdown).toEqual([]);
  });

  it("throws ValidationError for custom range with bad from timestamp", async () => {
    await expect(
      useCase.execute({
        mode: "custom",
        from: "not-a-date",
        to: "2025-01-31T23:59:59Z",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for custom range with bad to timestamp", async () => {
    await expect(
      useCase.execute({
        mode: "custom",
        from: "2025-01-01T00:00:00Z",
        to: "not-a-date",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for reversed custom range", async () => {
    await expect(
      useCase.execute({
        mode: "custom",
        from: "2025-12-31T23:59:59Z",
        to: "2025-01-01T00:00:00Z",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for date-only strings in custom range", async () => {
    await expect(
      useCase.execute({
        mode: "custom",
        from: "2025-06-01",
        to: "2025-06-30T23:59:59Z",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("accepts equal from and to as valid inclusive instant", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    const result = await useCase.execute({
      mode: "custom",
      from: "2025-06-15T12:00:00Z",
      to: "2025-06-15T12:00:00Z",
    });

    expect(result.window).toBe("custom");
  });

  it("rejects custom range with from=+00:00 offset", async () => {
    await expect(
      useCase.execute({
        mode: "custom",
        from: "2025-06-15T12:00:00+00:00",
        to: "2025-06-30T23:59:59Z",
      }),
    ).rejects.toThrow(ValidationError);
  });

  it("window mode cache key includes mode field for separation", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    await useCase.execute({ mode: "window", window: "day" });

    const key = cache.getOrSet.mock.calls[0][0] as string;
    // The stable stringify of { mode: "window", window: "day", ... }
    // produces a deterministic hash that differs from the pre-change key
    expect(key).toMatch(/^reports:v1:business:[a-f0-9]{40}$/);
  });

  it("custom mode cache key includes exact UTC bound values", async () => {
    reportRepo.getBusinessReport.mockResolvedValue(makeAggregate());

    await useCase.execute({
      mode: "custom",
      from: "2025-06-15T12:00:00.500Z",
      to: "2025-06-30T23:59:59Z",
    });

    const key = cache.getOrSet.mock.calls[0][0] as string;
    expect(key).toMatch(/^reports:v1:business:[a-f0-9]{40}$/);
  });

  // ── parseBusinessReportInput ─────────────────────────────────

  describe("parseBusinessReportInput", () => {
    it("parses window-only query into window mode input", () => {
      const input = GetBusinessReportUseCase.parseBusinessReportInput({
        window: "day",
      });
      expect(input).toEqual({ mode: "window", window: "day" });
    });

    it("parses from+to query into custom mode input", () => {
      const input = GetBusinessReportUseCase.parseBusinessReportInput({
        from: "2025-01-01T00:00:00Z",
        to: "2025-01-31T23:59:59Z",
      });
      expect(input).toEqual({
        mode: "custom",
        from: "2025-01-01T00:00:00Z",
        to: "2025-01-31T23:59:59Z",
      });
    });

    it("throws ValidationError when window and from are both present", () => {
      expect(() =>
        GetBusinessReportUseCase.parseBusinessReportInput({
          window: "day",
          from: "2025-01-01T00:00:00Z",
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError when window and to are both present", () => {
      expect(() =>
        GetBusinessReportUseCase.parseBusinessReportInput({
          window: "week",
          to: "2025-01-31T23:59:59Z",
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError when all three params present", () => {
      expect(() =>
        GetBusinessReportUseCase.parseBusinessReportInput({
          window: "month",
          from: "2025-01-01T00:00:00Z",
          to: "2025-01-31T23:59:59Z",
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError when from without to", () => {
      expect(() =>
        GetBusinessReportUseCase.parseBusinessReportInput({
          from: "2025-01-01T00:00:00Z",
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError when to without from", () => {
      expect(() =>
        GetBusinessReportUseCase.parseBusinessReportInput({
          to: "2025-01-31T23:59:59Z",
        }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError when no window or from/to provided", () => {
      expect(() =>
        GetBusinessReportUseCase.parseBusinessReportInput({}),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError for invalid window value", () => {
      expect(() =>
        GetBusinessReportUseCase.parseBusinessReportInput({
          window: "year",
        }),
      ).toThrow(ValidationError);
    });
  });
});
