import { ValidationError } from "../../../shared/errors/domain.error";
import {
  PAYMENT_METHODS,
  PaymentMethod,
  PaymentMethodAllocation,
} from "../domain/sale.entity";

const ALLOWED_PAYMENT_METHODS = new Set<PaymentMethod>(PAYMENT_METHODS);

export class SalePaymentPolicy {
  validate(
    paymentMethods: PaymentMethodAllocation[] | undefined,
  ): PaymentMethodAllocation[] {
    if (!Array.isArray(paymentMethods) || paymentMethods.length === 0) {
      throw new ValidationError("Sale must contain at least one payment method");
    }

    const methods = new Set<PaymentMethod>();

    for (const allocation of paymentMethods) {
      if (!allocation.method || !ALLOWED_PAYMENT_METHODS.has(allocation.method)) {
        throw new ValidationError(`Unsupported payment method: ${allocation.method}`);
      }

      if (typeof allocation.amount !== "string" || allocation.amount === "") {
        throw new ValidationError(
          `Payment method ${allocation.method} must include a valid amount`,
        );
      }

      if (methods.has(allocation.method)) {
        throw new ValidationError("Sale payment methods must be unique");
      }

      methods.add(allocation.method);
    }

    return paymentMethods;
  }
}
