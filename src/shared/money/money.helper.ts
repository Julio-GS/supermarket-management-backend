import { Decimal } from "decimal.js";

export const Money = {
  parse(value: string | number): Decimal {
    return new Decimal(value);
  },

  fromCents(cents: number): Decimal {
    return new Decimal(cents).div(100);
  },

  toString(value: Decimal): string {
    return value.toFixed(2);
  },

  multiply(a: Decimal, b: Decimal | number | string): Decimal {
    return a.mul(b);
  },

  add(a: Decimal, b: Decimal | number | string): Decimal {
    return a.add(b);
  },

  subtract(a: Decimal, b: Decimal | number | string): Decimal {
    return a.sub(b);
  },

  zero(): Decimal {
    return new Decimal(0);
  },
};

export function validateMoneyString(value: string): boolean {
  return /^-?\d+(\.\d{1,2})?$/.test(value);
}

export function moneyToNumericString(value: string): string {
  return Money.toString(Money.parse(value));
}
