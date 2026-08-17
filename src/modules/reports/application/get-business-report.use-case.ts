import { Injectable } from "@nestjs/common";
import { ReportRepositoryPort } from "./report.repository.port";
import {
  BusinessReport,
  ReportWindow,
  ReportMode,
  REPORT_WINDOWS,
} from "../domain/report.entity";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { buildCacheKey } from "../../../shared/cache/cache-key";
import { REPORT_READ_CACHE_POLICY } from "../../../shared/cache/cache-policy";
import { ValidationError } from "../../../shared/errors/domain.error";
import {
  resolveWindowBounds,
  formatReportRange,
  resolveCustomRangeBounds,
  formatCustomReportRange,
} from "./report-window";

export type BusinessReportInput =
  | { mode: "window"; window: ReportWindow }
  | { mode: "custom"; from: string; to: string };

@Injectable()
export class GetBusinessReportUseCase {
  private static readonly TOP_PRODUCTS_LIMIT = 10;

  constructor(
    private readonly reportRepo: ReportRepositoryPort,
    private readonly cache: ReadCachePort,
  ) {}

  static parseBusinessReportInput(
    query: { window?: unknown; from?: unknown; to?: unknown },
  ): BusinessReportInput {
    const hasWindow = query.window !== undefined && query.window !== null && query.window !== "";
    const hasFrom = query.from !== undefined && query.from !== null && query.from !== "";
    const hasTo = query.to !== undefined && query.to !== null && query.to !== "";

    // Nothing provided
    if (!hasWindow && !hasFrom && !hasTo) {
      throw new ValidationError(
        "Either 'window' (day|week|month) or 'from'+'to' UTC timestamps must be provided",
      );
    }

    // Mixed mode
    if (hasWindow && (hasFrom || hasTo)) {
      throw new ValidationError(
        "'window' and 'from'/'to' are mutually exclusive. Use either window mode or custom range mode.",
      );
    }

    // Incomplete custom range
    if ((hasFrom && !hasTo) || (hasTo && !hasFrom)) {
      throw new ValidationError(
        "Both 'from' and 'to' must be provided together for custom range mode",
      );
    }

    if (hasWindow) {
      const window = query.window as string;
      if (!REPORT_WINDOWS.includes(window as ReportWindow)) {
        throw new ValidationError(
          `Unsupported report window "${window}". Use day, week, or month.`,
        );
      }
      return { mode: "window", window: window as ReportWindow };
    }

    return {
      mode: "custom",
      from: query.from as string,
      to: query.to as string,
    };
  }

  async execute(input: BusinessReportInput): Promise<BusinessReport> {
    if (input.mode === "window") {
      return this.executeWindow(input.window);
    }

    return this.executeCustom(input.from, input.to);
  }

  private async executeWindow(window: ReportWindow): Promise<BusinessReport> {
    if (!REPORT_WINDOWS.includes(window)) {
      throw new ValidationError(
        `Unsupported report window "${window}". Use day, week, or month.`,
      );
    }

    const { startsAt, endsAt } = resolveWindowBounds(window);

    const cacheKey = buildCacheKey(
      REPORT_READ_CACHE_POLICY.prefix,
      "business",
      { mode: "window", window, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
    );

    const data = await this.cache.getOrSet(
      cacheKey,
      REPORT_READ_CACHE_POLICY.ttlMs,
      () => this.reportRepo.getBusinessReport(startsAt, endsAt),
    );

    return {
      window: window as ReportMode,
      range: formatReportRange(startsAt, endsAt),
      totalCollectedAmount: data.totalCollectedAmount,
      paymentMethodBreakdown: data.paymentMethodBreakdown,
      fiscal: data.fiscal,
      topProducts: data.topProducts.slice(
        0,
        GetBusinessReportUseCase.TOP_PRODUCTS_LIMIT,
      ),
    };
  }

  private async executeCustom(
    from: string,
    to: string,
  ): Promise<BusinessReport> {
    const { startsAt, endsAt } = resolveCustomRangeBounds(from, to);

    const cacheKey = buildCacheKey(
      REPORT_READ_CACHE_POLICY.prefix,
      "business",
      { mode: "custom", from: startsAt.toISOString(), to: endsAt.toISOString() },
    );

    const data = await this.cache.getOrSet(
      cacheKey,
      REPORT_READ_CACHE_POLICY.ttlMs,
      () => this.reportRepo.getBusinessReport(startsAt, endsAt),
    );

    return {
      window: "custom",
      range: formatCustomReportRange(startsAt, endsAt),
      totalCollectedAmount: data.totalCollectedAmount,
      paymentMethodBreakdown: data.paymentMethodBreakdown,
      fiscal: data.fiscal,
      topProducts: data.topProducts.slice(
        0,
        GetBusinessReportUseCase.TOP_PRODUCTS_LIMIT,
      ),
    };
  }
}
