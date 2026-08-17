import { ValidationError } from "../../../shared/errors/domain.error";
import { PAYMENT_METHODS, PaymentMethodAllocation } from "../domain/sale.entity";
import { SalePaymentPolicy } from "./sale-payment-policy";

describe("SalePaymentPolicy", () => {
  let policy: SalePaymentPolicy;

  beforeEach(() => {
    policy = new SalePaymentPolicy();
  });

  it("throws ValidationError when payment_methods is undefined or empty", () => {
    expect(() => policy.validate(undefined)).toThrow(ValidationError);
    expect(() => policy.validate(undefined)).toThrow(
      "Sale must contain at least one payment method",
    );
    expect(() => policy.validate([])).toThrow(
      "Sale must contain at least one payment method",
    );
  });

  it("throws ValidationError when an unsupported payment method is provided", () => {
    const invalid = [
      { method: "crypto" as unknown as PaymentMethodAllocation["method"], amount: "100.00" },
    ];
    expect(() => policy.validate(invalid)).toThrow(
      "Unsupported payment method: crypto",
    );
  });

  it("throws ValidationError when payment method amount is missing or empty string", () => {
    const missingAmount = [
      { method: "cash" as const, amount: "" },
    ];
    expect(() => policy.validate(missingAmount)).toThrow(
      "Payment method cash must include a valid amount",
    );

    const undefinedAmount = [
      { method: "card" as const } as unknown as PaymentMethodAllocation,
    ];
    expect(() => policy.validate(undefinedAmount)).toThrow(
      "Payment method card must include a valid amount",
    );

    const nonStringAmount = [
      { method: "cash" as const, amount: 50 as unknown as string },
    ];
    expect(() => policy.validate(nonStringAmount)).toThrow(
      "Payment method cash must include a valid amount",
    );
  });

  it("throws ValidationError when duplicate payment methods are provided", () => {
    const duplicates: PaymentMethodAllocation[] = [
      { method: "cash", amount: "50.00" },
      { method: "cash", amount: "50.00" },
    ];
    expect(() => policy.validate(duplicates)).toThrow(
      "Sale payment methods must be unique",
    );
  });

  it("accepts all supported payment methods from PAYMENT_METHODS", () => {
    for (const method of PAYMENT_METHODS) {
      const allocation: PaymentMethodAllocation[] = [
        { method, amount: "100.00" },
      ];
      expect(policy.validate(allocation)).toEqual(allocation);
    }
  });

  it("accepts multiple distinct payment methods with valid amounts", () => {
    const multiPayment: PaymentMethodAllocation[] = [
      { method: "cash", amount: "30.00" },
      { method: "card", amount: "40.00" },
      { method: "transfer", amount: "30.00" },
    ];
    expect(policy.validate(multiPayment)).toEqual(multiPayment);
  });
});
