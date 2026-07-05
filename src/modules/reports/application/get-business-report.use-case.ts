import { Injectable } from "@nestjs/common";
import { ReportRepositoryPort } from "./report.repository.port";
import {
  BusinessReport,
  ReportWindow,
  REPORT_WINDOWS,
} from "../domain/report.entity";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { buildCacheKey } from "../../../shared/cache/cache-key";
import { REPORT_READ_CACHE_POLICY } from "../../../shared/cache/cache-policy";
import { ValidationError } from "../../../shared/errors/domain.error";

const ARG_TZ = "America/Argentina/Buenos_Aires";

interface ArgDateParts {
  year: number;
  month: number;
  day: number;
  weekday: number; // 0=Sun, 1=Mon, ..., 6=Sat
}

function getArgDateParts(date: Date): ArgDateParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: ARG_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)!.value;
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    weekday: weekdays.indexOf(get("weekday")),
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function buildArgBoundary(
  year: number,
  month: number,
  day: number,
  endOfDay: boolean,
): Date {
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  return new Date(`${year}-${pad(month)}-${pad(day)}T${time}-03:00`);
}

function resolveDayBounds(): { startsAt: Date; endsAt: Date } {
  const today = getArgDateParts(new Date());
  return {
    startsAt: buildArgBoundary(today.year, today.month, today.day, false),
    endsAt: buildArgBoundary(today.year, today.month, today.day, true),
  };
}

function resolveWeekBounds(): { startsAt: Date; endsAt: Date } {
  const today = getArgDateParts(new Date());
  const daysFromMonday = today.weekday === 0 ? 6 : today.weekday - 1;

  const todayNoon = buildArgBoundary(today.year, today.month, today.day, false);
  const mondayDate = new Date(todayNoon);
  mondayDate.setUTCDate(mondayDate.getUTCDate() - daysFromMonday);

  const mondayParts = getArgDateParts(mondayDate);
  const startsAt = buildArgBoundary(
    mondayParts.year,
    mondayParts.month,
    mondayParts.day,
    false,
  );

  const sundayDate = new Date(startsAt);
  sundayDate.setUTCDate(sundayDate.getUTCDate() + 6);
  const sundayParts = getArgDateParts(sundayDate);

  return {
    startsAt,
    endsAt: buildArgBoundary(
      sundayParts.year,
      sundayParts.month,
      sundayParts.day,
      true,
    ),
  };
}

function resolveMonthBounds(): { startsAt: Date; endsAt: Date } {
  const today = getArgDateParts(new Date());
  const startsAt = buildArgBoundary(today.year, today.month, 1, false);

  const lastDay = new Date(Date.UTC(today.year, today.month, 0)).getUTCDate();

  return {
    startsAt,
    endsAt: buildArgBoundary(today.year, today.month, lastDay, true),
  };
}

function resolveWindowBounds(window: ReportWindow): {
  startsAt: Date;
  endsAt: Date;
} {
  switch (window) {
    case "day":
      return resolveDayBounds();
    case "week":
      return resolveWeekBounds();
    case "month":
      return resolveMonthBounds();
  }
}

function toIsoDate(date: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARG_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

@Injectable()
export class GetBusinessReportUseCase {
  private static readonly TOP_PRODUCTS_LIMIT = 10;

  constructor(
    private readonly reportRepo: ReportRepositoryPort,
    private readonly cache: ReadCachePort,
  ) {}

  async execute(window: ReportWindow): Promise<BusinessReport> {
    if (!REPORT_WINDOWS.includes(window)) {
      throw new ValidationError(
        `Unsupported report window "${window}". Use day, week, or month.`,
      );
    }

    const { startsAt, endsAt } = resolveWindowBounds(window);

    const cacheKey = buildCacheKey(
      REPORT_READ_CACHE_POLICY.prefix,
      "business",
      { window, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
    );

    const data = await this.cache.getOrSet(
      cacheKey,
      REPORT_READ_CACHE_POLICY.ttlMs,
      () => this.reportRepo.getBusinessReport(startsAt, endsAt),
    );

    return {
      window,
      range: {
        startsAt: `${toIsoDate(startsAt)}T00:00:00.000-03:00`,
        endsAt: `${toIsoDate(endsAt)}T23:59:59.999-03:00`,
      },
      totalCollectedAmount: data.totalCollectedAmount,
      paymentMethodBreakdown: data.paymentMethodBreakdown,
      topProducts: data.topProducts.slice(
        0,
        GetBusinessReportUseCase.TOP_PRODUCTS_LIMIT,
      ),
    };
  }
}
