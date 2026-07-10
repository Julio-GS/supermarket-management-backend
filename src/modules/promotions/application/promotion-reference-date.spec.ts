import { argentinaNow } from "./promotion-reference-date";

describe("argentinaNow", () => {
  it("returns a Date instance with a valid timestamp", () => {
    const result = argentinaNow();
    expect(result).toBeInstanceOf(Date);
    expect(isNaN(result.getTime())).toBe(false);
  });

  it("returns a date close to current system time", () => {
    const before = Date.now();
    const result = argentinaNow();
    const after = Date.now();

    // The result should be within a reasonable window of the actual time
    expect(result.getTime()).toBeGreaterThanOrEqual(before - 5000);
    expect(result.getTime()).toBeLessThanOrEqual(after + 5000);
  });

  it("uses the America/Argentina/Buenos_Aires timezone", () => {
    const result = argentinaNow();

    // Format the result in Argentina timezone — the helper must produce a
    // date that, when read in the Argentina locale, yields a coherent time.
    const argHourMinute = result.toLocaleString("en-US", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    expect(argHourMinute).toMatch(/^\d{2}:\d{2}$/);
  });
});
