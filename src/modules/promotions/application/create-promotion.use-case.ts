import { Injectable } from "@nestjs/common";
import {
  PromotionRepositoryPort,
  CreatePromotionInput,
} from "./promotion.repository.port";
import { Promotion } from "../domain/promotion.entity";
import { ValidationError } from "../../../shared/errors/domain.error";

@Injectable()
export class CreatePromotionUseCase {
  constructor(private readonly promoRepo: PromotionRepositoryPort) {}

  async execute(input: CreatePromotionInput): Promise<Promotion> {
    this.validate(input);
    const target = this.resolveTarget(input);
    return this.promoRepo.create({
      ...input,
      scope: target.scope,
      product_id: target.product_id,
    });
  }

  private validate(input: CreatePromotionInput): void {
    if (!input.name || input.name.trim().length === 0) {
      throw new ValidationError("Promotion name is required");
    }

    if (input.type === "percentage") {
      if (
        input.discount_percent === undefined ||
        input.discount_percent === null ||
        input.discount_percent < 1 ||
        input.discount_percent > 99
      ) {
        throw new ValidationError(
          "Percentage promotion requires discount_percent between 1 and 99",
        );
      }
    }

    if (input.type === "two_x_one") {
      if (
        input.discount_percent !== undefined &&
        input.discount_percent !== null
      ) {
        throw new ValidationError(
          "2x1 promotion must not have discount_percent",
        );
      }
    }

    const hasDateRange =
      input.start_date && input.end_date;
    const hasWeekdays =
      Array.isArray(input.weekdays) && input.weekdays.length > 0;

    if (!hasDateRange && !hasWeekdays) {
      throw new ValidationError(
        "Promotion must have a schedule: either date range (start_date + end_date) or weekdays",
      );
    }

    if (hasDateRange && input.start_date! > input.end_date!) {
      throw new ValidationError("start_date must be on or before end_date");
    }

    if (hasWeekdays) {
      for (const day of input.weekdays!) {
        if (day < 1 || day > 7) {
          throw new ValidationError(
            "Weekdays must be between 1 (Monday) and 7 (Sunday)",
          );
        }
      }
    }
  }

  private resolveTarget(
    input: CreatePromotionInput,
  ): { scope: "product" | "store"; product_id: string | null } {
    if (input.scope === "store") {
      if (input.product_id) {
        throw new ValidationError(
          "Store-wide promotions must not include product_id",
        );
      }

      return { scope: "store", product_id: null };
    }

    if (!input.product_id) {
      throw new ValidationError(
        "Product promotions must include product_id when scope is omitted or set to product",
      );
    }

    return { scope: "product", product_id: input.product_id };
  }
}
