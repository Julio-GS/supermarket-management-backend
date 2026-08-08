import { ReportWindow } from "../domain/report.entity";
import { ValidationError } from "../../../shared/errors/domain.error";

export const ARG_TZ = "America/Argentina/Buenos_Aires";

export interface ArgDateParts {
  year: number;
  month: number;
  day: number;
  weekday: number; // 0=Sun, 1=Mon, ..., 6=Sat
}

export function getArgDateParts(date: Date): ArgDateParts {
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

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function buildArgBoundary(
  year: number,
  month: number,
  day: number,
  endOfDay: boolean,
): Date {
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  return new Date(`${year}-${pad(month)}-${pad(day)}T${time}-03:00`);
}

export function resolveDayBounds(): { startsAt: Date; endsAt: Date } {
  const today = getArgDateParts(new Date());
  return {
    startsAt: buildArgBoundary(today.year, today.month, today.day, false),
    endsAt: buildArgBoundary(today.year, today.month, today.day, true),
  };
}

export function resolveWeekBounds(): { startsAt: Date; endsAt: Date } {
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

export function resolveMonthBounds(): { startsAt: Date; endsAt: Date } {
  const today = getArgDateParts(new Date());
  const startsAt = buildArgBoundary(today.year, today.month, 1, false);

  const lastDay = new Date(Date.UTC(today.year, today.month, 0)).getUTCDate();

  return {
    startsAt,
    endsAt: buildArgBoundary(today.year, today.month, lastDay, true),
  };
}

export function resolveWindowBounds(window: ReportWindow): {
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

export function toIsoDate(date: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARG_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

export function formatReportRange(
  startsAt: Date,
  endsAt: Date,
): { startsAt: string; endsAt: string } {
  return {
    startsAt: `${toIsoDate(startsAt)}T00:00:00.000-03:00`,
    endsAt: `${toIsoDate(endsAt)}T23:59:59.999-03:00`,
  };
}

// ── Strict UTC custom-range helpers ────────────────────────────

const UTC_Z_TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

export function parseStrictUtcZTimestamp(
  value: string,
  field: "from" | "to",
): Date {
  const match = value.match(UTC_Z_TIMESTAMP);
  if (!match) {
    throw new ValidationError(
      `Invalid ${field} timestamp "${value}". Expected strict UTC Z format: YYYY-MM-DDTHH:mm:ss[.SSS]Z`,
    );
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const second = parseInt(match[6], 10);
  const fracRaw = match[7] ?? "";

  // Validate component ranges
  if (month < 1 || month > 12) {
    throw new ValidationError(
      `Invalid ${field} timestamp "${value}": month must be 1-12`,
    );
  }
  if (hour > 23) {
    throw new ValidationError(
      `Invalid ${field} timestamp "${value}": hour must be 0-23`,
    );
  }
  if (minute > 59) {
    throw new ValidationError(
      `Invalid ${field} timestamp "${value}": minute must be 0-59`,
    );
  }
  if (second > 59) {
    throw new ValidationError(
      `Invalid ${field} timestamp "${value}": second must be 0-59`,
    );
  }
  if (fracRaw.length > 3) {
    throw new ValidationError(
      `Invalid ${field} timestamp "${value}": milliseconds must be 1-3 digits`,
    );
  }

  // Normalize milliseconds by right-padding to 3 digits
  const millisecond = fracRaw ? parseInt(fracRaw.padEnd(3, "0"), 10) : 0;

  // Construct via Date.UTC and validate canonical identity
  const timestamp = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(
      `Invalid ${field} timestamp "${value}": not a valid date`,
    );
  }

  // Canonical component comparison — rejects normalized impossible dates
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second ||
    date.getUTCMilliseconds() !== millisecond
  ) {
    throw new ValidationError(
      `Invalid ${field} timestamp "${value}": impossible calendar date`,
    );
  }

  return date;
}

export interface ReportBounds {
  startsAt: Date;
  endsAt: Date;
}

export function resolveCustomRangeBounds(from: string, to: string): ReportBounds {
  const startsAt = parseStrictUtcZTimestamp(from, "from");
  const endsAt = parseStrictUtcZTimestamp(to, "to");

  if (endsAt.getTime() < startsAt.getTime()) {
    throw new ValidationError(
      `Invalid report range: "to" (${to}) must not be before "from" (${from})`,
    );
  }

  return { startsAt, endsAt };
}

export function formatCustomReportRange(
  startsAt: Date,
  endsAt: Date,
): { startsAt: string; endsAt: string } {
  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
}
