import {
  Money,
  validateMoneyString,
  moneyToNumericString,
} from "./money.helper";

describe("Money helper", () => {
  it("parses monetary strings safely", () => {
    expect(Money.toString(Money.parse("2500.50"))).toBe("2500.50");
    expect(Money.toString(Money.parse("100"))).toBe("100.00");
  });

  it("multiplies without floating point errors", () => {
    const price = Money.parse("0.10");
    const qty = Money.parse("3");
    expect(Money.toString(Money.multiply(price, qty))).toBe("0.30");
  });

  it("adds totals safely", () => {
    const a = Money.parse("10.30");
    const b = Money.parse("20.70");
    expect(Money.toString(Money.add(a, b))).toBe("31.00");
  });

  it("validates money strings", () => {
    expect(validateMoneyString("2500.50")).toBe(true);
    expect(validateMoneyString("2500")).toBe(true);
    expect(validateMoneyString("2500.123")).toBe(false);
    expect(validateMoneyString("abc")).toBe(false);
  });

  it("formats money to numeric string", () => {
    expect(moneyToNumericString("2500.5")).toBe("2500.50");
  });
});
