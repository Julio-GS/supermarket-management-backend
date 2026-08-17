import { Decimal } from "decimal.js";
import { ValidationError } from "../../../shared/errors/domain.error";
import { Money } from "../../../shared/money/money.helper";
import {
  CreateManualDiscountInput,
  PricedSaleLine,
  PricingResult,
  ResolvedManualDiscount,
  ResolvedSaleLines,
} from "./create-sale.types";
import { SaleItemCreateData } from "./sale.repository.port";

const AD_HOC_IVA_RATE = "21.00";

function requireMoney(value: string | undefined, message: string): Decimal {
  if (typeof value !== "string" || value === "") {
    throw new ValidationError(message);
  }
  return Money.parse(value);
}

export class SalePricingCalculator {
  price(input: {
    resolved: ResolvedSaleLines;
    manualDiscount: CreateManualDiscountInput | null | undefined;
    invoiceRequested?: boolean;
  }): PricingResult {
    const { resolved, manualDiscount: manualDiscountInput } = input;
    const pricedLines: PricedSaleLine[] = [];
    const saleItems: SaleItemCreateData[] = [];
    let postPromotionSubtotal = Money.zero();

    for (const line of resolved.lines) {
      const unitPrice = Money.parse(line.unitPrice);

      if (line.kind === "ad-hoc") {
        const grossSubtotal = Money.multiply(unitPrice, line.quantity);
        let appliedPromotionId: string | null = null;
        let appliedPromotionType: string | null = null;

        const promo =
          resolved.promotionsByOriginalIndex?.get(line.originalIndex) ??
          resolved.promotionsByLineId.get(line.lineId) ??
          null;

        if (promo) {
          appliedPromotionId = promo.promotionId;
          appliedPromotionType = promo.type;
        }

        // Filter out product-scoped promotions; ad-hoc items only receive store promotions
        const storePromotions = (promo?.applied_promotions ?? []).filter(
          (p) => p.promotion_scope === "store",
        );
        let storeDiscountTotal = Money.zero();
        for (const p of storePromotions) {
          storeDiscountTotal = Money.add(
            storeDiscountTotal,
            Money.parse(p.discount_amount),
          );
        }
        const storeDiscountAmount = Money.toString(storeDiscountTotal);
        const discountedSubtotal = Money.subtract(
          grossSubtotal,
          storeDiscountTotal,
        );

        const saleItem: SaleItemCreateData = {
          product_id: line.lineId,
          name: line.adHoc.name ?? null,
          description: line.adHoc.description ?? null,
          iva: AD_HOC_IVA_RATE,
          quantity: line.quantity,
          unit_price: Money.toString(unitPrice),
          subtotal: Money.toString(discountedSubtotal),
          discount_amount: storeDiscountAmount,
          applied_promotions: storePromotions,
          applied_promotion_id: appliedPromotionId,
          applied_promotion_type: appliedPromotionType,
        };

        saleItems.push(saleItem);
        pricedLines.push({
          lineId: line.lineId,
          originalIndex: line.originalIndex,
          kind: line.kind,
          quantity: line.quantity,
          unitPrice,
          grossSubtotal,
          discountAmount: storeDiscountTotal,
          discountedSubtotal,
          saleItem,
        });

        postPromotionSubtotal = Money.add(
          postPromotionSubtotal,
          discountedSubtotal,
        );
      } else if (line.kind === "catalog-manual") {
        const subtotal = line.lineTotal;
        const subtotalDecimal = Money.parse(subtotal);

        const saleItem: SaleItemCreateData = {
          product_id: line.lineId,
          quantity: 1,
          unit_price: Money.toString(unitPrice),
          subtotal,
          discount_amount: "0.00",
          applied_promotions: [],
          applied_promotion_id: null,
          applied_promotion_type: null,
          ...(line.ivaForPersistence ? { iva: line.ivaForPersistence } : {}),
        };

        saleItems.push(saleItem);
        pricedLines.push({
          lineId: line.lineId,
          originalIndex: line.originalIndex,
          kind: line.kind,
          quantity: 1,
          unitPrice,
          grossSubtotal: subtotalDecimal,
          discountAmount: Money.zero(),
          discountedSubtotal: subtotalDecimal,
          saleItem,
        });

        postPromotionSubtotal = Money.add(
          postPromotionSubtotal,
          subtotalDecimal,
        );
      } else {
        const grossSubtotal = Money.multiply(unitPrice, line.quantity);
        let discountAmount = Money.zero();
        let appliedPromotionId: string | null = null;
        let appliedPromotionType: string | null = null;

        const promo =
          resolved.promotionsByOriginalIndex?.get(line.originalIndex) ??
          resolved.promotionsByLineId.get(line.lineId) ??
          null;

        if (promo) {
          discountAmount = Money.parse(promo.discountAmount);
          appliedPromotionId = promo.promotionId;
          appliedPromotionType = promo.type;
        }

        const discountedSubtotal = Money.subtract(grossSubtotal, discountAmount);

        const saleItem: SaleItemCreateData = {
          product_id: line.lineId,
          quantity: line.quantity,
          unit_price: Money.toString(unitPrice),
          subtotal: Money.toString(discountedSubtotal),
          discount_amount: Money.toString(discountAmount),
          applied_promotions: promo?.applied_promotions ?? [],
          applied_promotion_id: appliedPromotionId,
          applied_promotion_type: appliedPromotionType,
          ...(line.ivaForPersistence ? { iva: line.ivaForPersistence } : {}),
        };

        saleItems.push(saleItem);
        pricedLines.push({
          lineId: line.lineId,
          originalIndex: line.originalIndex,
          kind: line.kind,
          quantity: line.quantity,
          unitPrice,
          grossSubtotal,
          discountAmount,
          discountedSubtotal,
          saleItem,
        });

        postPromotionSubtotal = Money.add(
          postPromotionSubtotal,
          discountedSubtotal,
        );
      }
    }

    const manualDiscount = this.resolveManualDiscount(
      manualDiscountInput,
      postPromotionSubtotal,
    );

    const finalTotal = Money.subtract(
      postPromotionSubtotal,
      manualDiscount.amount,
    );
    if (finalTotal.lt(0)) {
      throw new ValidationError("discount exceeds subtotal");
    }

    return {
      pricedLines,
      saleItems,
      postPromotionSubtotal,
      manualDiscount,
      finalTotal,
    };
  }

  private resolveManualDiscount(
    input: CreateManualDiscountInput | null | undefined,
    subtotal: Decimal,
  ): ResolvedManualDiscount {
    if (!input) {
      return { amount: Money.zero(), modality: null, percentage: null };
    }

    const amount = requireMoney(
      input.amount,
      "manual discount amount is required",
    );
    if (amount.lt(0)) {
      throw new ValidationError("discount must be non-negative");
    }

    if (input.modality === "fixed") {
      if (amount.gt(subtotal)) {
        throw new ValidationError("discount exceeds subtotal");
      }
      if (amount.eq(0)) {
        return { amount: Money.zero(), modality: null, percentage: null };
      }
      return { amount, modality: "fixed", percentage: null };
    }

    const percentage = requireMoney(
      input.percentage,
      "manual discount percentage is required",
    );
    if (percentage.lt(0) || percentage.gt(100)) {
      throw new ValidationError("percentage must be between 0 and 100");
    }

    const expected = subtotal
      .mul(percentage)
      .div(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    if (expected.sub(amount).abs().gt(0.01)) {
      throw new ValidationError("percentage amount mismatch");
    }
    if (expected.gt(subtotal)) {
      throw new ValidationError("discount exceeds subtotal");
    }
    if (expected.eq(0)) {
      return { amount: Money.zero(), modality: null, percentage: null };
    }
    return {
      amount: expected,
      modality: "percentage",
      percentage: Money.toString(percentage),
    };
  }
}
