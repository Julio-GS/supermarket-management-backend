import { Injectable } from "@nestjs/common";
import { PromotionRepositoryPort } from "./promotion.repository.port";
import { Promotion, PromotionScope } from "../domain/promotion.entity";
import { Money } from "../../../shared/money/money.helper";
import { argentinaNow, ARG_TZ } from "./promotion-reference-date";

export interface AppliedPromotion {
  promotion_id: string;
  promotion_scope: PromotionScope;
  promotion_type: "percentage" | "two_x_one";
  discount_amount: string;
}

export interface ResolvedPromotion {
  promotionId: string | null;
  type: "percentage" | "two_x_one" | null;
  discountAmount: string;
  applied_promotions: AppliedPromotion[];
}

export interface SaleItemForResolution {
  productId: string;
  unitPrice: string;
  quantity: number;
}

@Injectable()
export class PromotionResolverService {
  constructor(private readonly promotionRepo: PromotionRepositoryPort) {}

  async resolveForSaleItems(
    items: SaleItemForResolution[],
    now?: Date,
  ): Promise<ResolvedPromotion[]> {
    if (items.length === 0) return [];

    const referenceDate = now ?? argentinaNow();
    const productIds = [...new Set(items.map((i) => i.productId))];
    const promotions = await this.promotionRepo.findActiveByProductIds(
      productIds,
      referenceDate,
    );

    const active = promotions.filter((p) =>
      this.isScheduleActive(p, referenceDate),
    );

    const storeWidePromotions = active
      .filter((promo) => promo.scope === "store")
      .sort((left, right) => right.updated_at.getTime() - left.updated_at.getTime());

    const byProduct = new Map<string, Promotion[]>();
    for (const promo of active) {
      if (promo.scope !== "product" || !promo.product_id) continue;
      const list = byProduct.get(promo.product_id) ?? [];
      list.push(promo);
      byProduct.set(promo.product_id, list);
    }

    // Build one resolved result per item (parallel array, index-stable)
    return items.map((item) => {
      const appliedPromotions: AppliedPromotion[] = [];

      for (const promo of storeWidePromotions) {
        const discountAmount = this.computeDiscount(promo, item);
        if (Money.parse(discountAmount).gt(0)) {
          appliedPromotions.push({
            promotion_id: promo.id,
            promotion_scope: promo.scope,
            promotion_type: promo.type,
            discount_amount: discountAmount,
          });
        }
      }

      const candidates = byProduct.get(item.productId);
      const best = candidates ? this.pickBestPromotion(candidates, item) : null;
      if (best) {
        appliedPromotions.push(best);
      }

      if (appliedPromotions.length === 0) {
        return null as unknown as ResolvedPromotion;
      }

      const sorted = [...appliedPromotions].sort((left, right) => {
        const leftDiscount = Money.parse(left.discount_amount);
        const rightDiscount = Money.parse(right.discount_amount);

        if (leftDiscount.gt(rightDiscount)) return -1;
        if (leftDiscount.lt(rightDiscount)) return 1;

        if (left.promotion_type !== right.promotion_type) {
          if (left.promotion_type === "percentage") return -1;
          if (right.promotion_type === "percentage") return 1;
        }

        return 0;
      });

      const totalDiscount = sorted.reduce(
        (sum, promotion) => Money.add(sum, promotion.discount_amount),
        Money.zero(),
      );
      const primary = sorted[0] ?? null;

      return {
        promotionId: primary?.promotion_id ?? null,
        type: primary?.promotion_type ?? null,
        discountAmount: Money.toString(totalDiscount),
        applied_promotions: sorted,
      };
    });
  }

  private isScheduleActive(promo: Promotion, now: Date): boolean {
    const argDay = this.argentinaDayOfWeek(now);

    const hasDateRange = promo.start_date && promo.end_date;
    const hasWeekdays =
      Array.isArray(promo.weekdays) && promo.weekdays.length > 0;

    if (hasDateRange) {
      return promo.start_date! <= now && promo.end_date! >= now;
    }

    if (hasWeekdays) {
      return promo.weekdays!.includes(argDay);
    }

    return false;
  }

  private argentinaDayOfWeek(date: Date): number {
    const argString = date.toLocaleString("en-US", { timeZone: ARG_TZ });
    const argDate = new Date(argString);
    const jsDay = argDate.getDay(); // 0=Sun, 1=Mon, ... 6=Sat
    return jsDay === 0 ? 7 : jsDay; // Convert to 1=Mon ... 7=Sun
  }

  private pickBestPromotion(
    candidates: Promotion[],
    item: SaleItemForResolution,
  ): AppliedPromotion | null {
    let best: AppliedPromotion | null = null;
    let bestDiscount = Money.zero();

    for (const promo of candidates) {
      const discount = this.computeDiscount(promo, item);
      const discountDecimal = Money.parse(discount);

      if (discountDecimal.gt(bestDiscount)) {
        bestDiscount = discountDecimal;
        best = {
          promotion_id: promo.id,
          promotion_scope: promo.scope,
          promotion_type: promo.type,
          discount_amount: discount,
        };
      } else if (
        discountDecimal.eq(bestDiscount) &&
        best !== null &&
        promo.type === "percentage" &&
        best.promotion_type === "two_x_one"
      ) {
        // Tie-break: percentage wins over 2x1
        best = {
          promotion_id: promo.id,
          promotion_scope: promo.scope,
          promotion_type: promo.type,
          discount_amount: discount,
        };
      } else if (
        discountDecimal.eq(bestDiscount) &&
        best !== null &&
        best.promotion_type === promo.type
      ) {
        // Same type tie-break: newest updated_at
        const bestUpdatedAt =
          candidates.find((c) => c.id === best!.promotion_id)?.updated_at ??
          new Date(0);
        if (promo.updated_at > bestUpdatedAt) {
          best = {
            promotion_id: promo.id,
            promotion_scope: promo.scope,
            promotion_type: promo.type,
            discount_amount: discount,
          };
        }
      }
    }

    if (best && Money.parse(best.discount_amount).gt(0)) {
      return best;
    }

    return null;
  }

  private computeDiscount(
    promo: Promotion,
    item: SaleItemForResolution,
  ): string {
    const unitPrice = Money.parse(item.unitPrice);

    if (promo.type === "percentage" && promo.discount_percent) {
      const pct = Money.parse(promo.discount_percent.toString());
      const subtotal = Money.multiply(unitPrice, item.quantity);
      const discount = Money.multiply(subtotal, pct).div(100);
      return Money.toString(discount);
    }

    if (promo.type === "two_x_one") {
      const freeUnits = Math.floor(item.quantity / 2);
      if (freeUnits === 0) return "0.00";
      const discount = Money.multiply(unitPrice, freeUnits);
      return Money.toString(discount);
    }

    return "0.00";
  }
}
