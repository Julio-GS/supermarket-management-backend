import {
  getArgDateParts,
  buildArgBoundary,
  resolveDayBounds,
  resolveWeekBounds,
  resolveMonthBounds,
  resolveWindowBounds,
  formatReportRange,
} from "./report-window";

describe("report-window", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    // 2026-07-02T15:00:00Z = 2026-07-02T12:00:00-03:00 (ARG Thursday)
    jest.setSystemTime(new Date("2026-07-02T15:00:00.000Z"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe("getArgDateParts", () => {
    it("returns correct ARG date parts for a given date", () => {
      // 2026-07-02T15:00:00Z is 2026-07-02 12:00 in ARG
      const parts = getArgDateParts(new Date("2026-07-02T15:00:00.000Z"));
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(7);
      expect(parts.day).toBe(2);
      // Thursday = 4 in our mapping (Mon=1)
      expect(parts.weekday).toBe(4);
    });
  });

  describe("buildArgBoundary", () => {
    it("builds start-of-day boundary for ARG timezone", () => {
      const result = buildArgBoundary(2026, 7, 2, false);
      expect(result.toISOString()).toContain("2026-07-02T03:00:00.000Z");
    });

    it("builds end-of-day boundary for ARG timezone", () => {
      const result = buildArgBoundary(2026, 7, 2, true);
      expect(result.toISOString()).toContain("2026-07-03T02:59:59.999Z");
    });
  });

  describe("resolveDayBounds", () => {
    it("returns today boundaries in ARG timezone", () => {
      const { startsAt, endsAt } = resolveDayBounds();
      // 2026-07-02T03:00:00.000Z = 2026-07-02T00:00:00.000-03:00
      expect(startsAt.toISOString()).toContain("2026-07-02T03:00:00.000Z");
      // 2026-07-03T02:59:59.999Z = 2026-07-02T23:59:59.999-03:00
      expect(endsAt.toISOString()).toContain("2026-07-03T02:59:59.999Z");
    });
  });

  describe("resolveWeekBounds", () => {
    it("returns Mon to Sun for ARG Thursday", () => {
      const { startsAt, endsAt } = resolveWeekBounds();
      // Monday 2026-06-29
      expect(startsAt.toISOString()).toContain("2026-06-29T03:00:00.000Z");
      // Sunday 2026-07-05
      expect(endsAt.toISOString()).toContain("2026-07-06T02:59:59.999Z");
    });
  });

  describe("resolveMonthBounds", () => {
    it("returns first to last day of July 2026", () => {
      const { startsAt, endsAt } = resolveMonthBounds();
      // July 1 at ARG midnight = 03:00Z
      expect(startsAt.toISOString()).toContain("2026-07-01T03:00:00.000Z");
      // July 31 at ARG 23:59:59.999 = Aug 1 02:59:59.999Z
      expect(endsAt.toISOString()).toContain("2026-08-01T02:59:59.999Z");
    });
  });

  describe("resolveWindowBounds", () => {
    it("calls resolveDayBounds for day", () => {
      const { startsAt } = resolveWindowBounds("day");
      expect(startsAt.toISOString()).toContain("2026-07-02T03:00:00.000Z");
    });

    it("calls resolveWeekBounds for week", () => {
      const { startsAt } = resolveWindowBounds("week");
      expect(startsAt.toISOString()).toContain("2026-06-29T03:00:00.000Z");
    });

    it("calls resolveMonthBounds for month", () => {
      const { startsAt } = resolveWindowBounds("month");
      expect(startsAt.toISOString()).toContain("2026-07-01T03:00:00.000Z");
    });
  });

  describe("formatReportRange", () => {
    it("formats start and end dates with ARG offset strings", () => {
      const startsAt = new Date("2026-07-02T03:00:00.000Z");
      const endsAt = new Date("2026-07-03T02:59:59.999Z");

      const range = formatReportRange(startsAt, endsAt);

      expect(range.startsAt).toBe("2026-07-02T00:00:00.000-03:00");
      expect(range.endsAt).toBe("2026-07-02T23:59:59.999-03:00");
    });
  });
});
