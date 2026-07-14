import { Injectable } from "@nestjs/common";
import { ProviderPurchaseRepositoryPort } from "./provider-purchase.repository.port";
import {
  ProviderPurchaseReport,
} from "../domain/provider-purchase.entity";
import {
  ReportWindow,
  REPORT_WINDOWS,
} from "../domain/report.entity";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { buildCacheKey } from "../../../shared/cache/cache-key";
import { REPORT_READ_CACHE_POLICY } from "../../../shared/cache/cache-policy";
import { ValidationError } from "../../../shared/errors/domain.error";
import { resolveWindowBounds, formatReportRange } from "./report-window";

@Injectable()
export class GetProviderPurchaseReportUseCase {
  constructor(
    private readonly repo: ProviderPurchaseRepositoryPort,
    private readonly cache: ReadCachePort,
  ) {}

  async execute(window: ReportWindow): Promise<ProviderPurchaseReport> {
    if (!REPORT_WINDOWS.includes(window)) {
      throw new ValidationError(
        `Unsupported report window "${window}". Use day, week, or month.`,
      );
    }

    const { startsAt, endsAt } = resolveWindowBounds(window);

    const cacheKey = buildCacheKey(
      REPORT_READ_CACHE_POLICY.prefix,
      "provider-purchase",
      { window, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
    );

    const data = await this.cache.getOrSet(
      cacheKey,
      REPORT_READ_CACHE_POLICY.ttlMs,
      () => this.repo.aggregateByProvider(startsAt, endsAt),
    );

    return {
      window,
      range: formatReportRange(startsAt, endsAt),
      totalAmount: data.totalAmount,
      purchaseCount: data.purchaseCount,
      paymentMethodBreakdown: data.paymentMethodBreakdown,
    };
  }
}
