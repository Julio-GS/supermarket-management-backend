import {
  getArgDateParts,
  buildArgBoundary,
  resolveDayBounds,
  resolveWeekBounds,
  resolveMonthBounds,
  resolveWindowBounds,
  formatReportRange,
  parseStrictUtcZTimestamp,
  resolveCustomRangeBounds,
  formatCustomReportRange,
} from "./report-window";
import { ValidationError } from "../../../shared/errors/domain.error";

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

  describe("parseStrictUtcZTimestamp", () => {
    it("parses a valid UTC Z timestamp with seconds", () => {
      const result = parseStrictUtcZTimestamp("2025-06-15T12:30:00Z", "from");
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe("2025-06-15T12:30:00.000Z");
    });

    it("parses a valid UTC Z timestamp with 1-digit ms", () => {
      const result = parseStrictUtcZTimestamp("2025-06-15T12:30:00.1Z", "from");
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe("2025-06-15T12:30:00.100Z");
    });

    it("parses a valid UTC Z timestamp with 2-digit ms", () => {
      const result = parseStrictUtcZTimestamp("2025-06-15T12:30:00.12Z", "from");
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe("2025-06-15T12:30:00.120Z");
    });

    it("parses a valid UTC Z timestamp with 3-digit ms", () => {
      const result = parseStrictUtcZTimestamp("2025-06-15T12:30:00.123Z", "from");
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe("2025-06-15T12:30:00.123Z");
    });

    it("rejects date-only string", () => {
      expect(() =>
        parseStrictUtcZTimestamp("2025-06-15", "from"),
      ).toThrow(ValidationError);
    });

    it("rejects local timestamp without Z", () => {
      expect(() =>
        parseStrictUtcZTimestamp("2025-06-15T12:30:00", "from"),
      ).toThrow(ValidationError);
    });

    it("rejects +00:00 offset even though it represents UTC", () => {
      expect(() =>
        parseStrictUtcZTimestamp("2025-06-15T12:30:00+00:00", "from"),
      ).toThrow(ValidationError);
    });

    it("rejects -03:00 offset", () => {
      expect(() =>
        parseStrictUtcZTimestamp("2025-06-15T12:30:00-03:00", "from"),
      ).toThrow(ValidationError);
    });

    it("rejects malformed string", () => {
      expect(() =>
        parseStrictUtcZTimestamp("not-a-date", "from"),
      ).toThrow(ValidationError);
    });

    it("rejects impossible calendar date 2025-02-30 (Feb 30)", () => {
      expect(() =>
        parseStrictUtcZTimestamp("2025-02-30T00:00:00Z", "from"),
      ).toThrow(ValidationError);
    });

    it("rejects impossible calendar date 2025-02-29 (non-leap year)", () => {
      // 2025 is not a leap year
      expect(() =>
        parseStrictUtcZTimestamp("2025-02-29T00:00:00Z", "from"),
      ).toThrow(ValidationError);
    });

    it("accepts valid leap date 2024-02-29", () => {
      const result = parseStrictUtcZTimestamp("2024-02-29T00:00:00Z", "from");
      expect(result).toBeInstanceOf(Date);
      expect(result.toISOString()).toBe("2024-02-29T00:00:00.000Z");
    });

    it("includes field name in error message", () => {
      try {
        parseStrictUtcZTimestamp("bad", "to");
        fail("expected error");
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).message).toContain("to");
      }
    });

    it("rejects milliseconds with 4+ digits", () => {
      expect(() =>
        parseStrictUtcZTimestamp("2025-06-15T12:30:00.1234Z", "from"),
      ).toThrow(ValidationError);
    });

    it("rejects invalid month (13)", () => {
      expect(() =>
        parseStrictUtcZTimestamp("2025-13-01T00:00:00Z", "from"),
      ).toThrow(ValidationError);
    });

    it("rejects invalid hour (24)", () => {
      expect(() =>
        parseStrictUtcZTimestamp("2025-01-01T24:00:00Z", "from"),
      ).toThrow(ValidationError);
    });

    it("rejects invalid month (0)", () => {
      expect(() =>
        parseStrictUtcZTimestamp("2025-00-01T00:00:00Z", "from"),
      ).toThrow(ValidationError);
    });

    it("rejects invalid second (60)", () => {
      expect(() =>
        parseStrictUtcZTimestamp("2025-01-01T00:00:60Z", "from"),
      ).toThrow(ValidationError);
    });

    it("rejects invalid minute (60)", () => {
      expect(() =>
        parseStrictUtcZTimestamp("2025-01-01T00:60:00Z", "from"),
      ).toThrow(ValidationError);
    });
  });

  describe("resolveCustomRangeBounds", () => {
    it("returns exact Date objects for valid from/to", () => {
      const { startsAt, endsAt } = resolveCustomRangeBounds(
        "2025-01-01T00:00:00Z",
        "2025-12-31T23:59:59Z",
      );
      expect(startsAt).toBeInstanceOf(Date);
      expect(endsAt).toBeInstanceOf(Date);
      expect(startsAt.toISOString()).toBe("2025-01-01T00:00:00.000Z");
      expect(endsAt.toISOString()).toBe("2025-12-31T23:59:59.000Z");
    });

    it("accepts equal from and to", () => {
      const { startsAt, endsAt } = resolveCustomRangeBounds(
        "2025-06-15T12:00:00Z",
        "2025-06-15T12:00:00Z",
      );
      expect(startsAt.getTime()).toBe(endsAt.getTime());
    });

    it("rejects reversed range (to before from)", () => {
      expect(() =>
        resolveCustomRangeBounds(
          "2025-12-31T23:59:59Z",
          "2025-01-01T00:00:00Z",
        ),
      ).toThrow(ValidationError);
    });

    it("rejects reversed range with error message mentioning from/to", () => {
      try {
        resolveCustomRangeBounds(
          "2025-06-30T23:59:59Z",
          "2025-06-01T00:00:00Z",
        );
        fail("expected error");
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).message).toMatch(/from.*to|range/i);
      }
    });
  });

  describe("formatCustomReportRange", () => {
    it("returns ISO strings for the given Date bounds", () => {
      const startsAt = new Date("2025-06-01T00:00:00.000Z");
      const endsAt = new Date("2025-06-30T23:59:59.999Z");
      const range = formatCustomReportRange(startsAt, endsAt);
      expect(range.startsAt).toBe("2025-06-01T00:00:00.000Z");
      expect(range.endsAt).toBe("2025-06-30T23:59:59.999Z");
    });
  });
});
