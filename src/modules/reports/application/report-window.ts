import { ReportWindow } from "../domain/report.entity";

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
