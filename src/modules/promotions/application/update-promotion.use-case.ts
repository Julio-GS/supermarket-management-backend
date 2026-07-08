import { Injectable } from "@nestjs/common";
import {
  PromotionRepositoryPort,
  UpdatePromotionInput,
} from "./promotion.repository.port";
import { Promotion } from "../domain/promotion.entity";
import { NotFoundError, ValidationError } from "../../../shared/errors/domain.error";

@Injectable()
export class UpdatePromotionUseCase {
  constructor(private readonly promoRepo: PromotionRepositoryPort) {}

  async execute(
    id: string,
    input: UpdatePromotionInput,
  ): Promise<Promotion> {
    const existing = await this.promoRepo.findById(id);
    if (!existing) {
      throw new NotFoundError(`Promotion ${id} not found`);
    }

    if (input.type === "two_x_one" && input.discount_percent) {
      throw new ValidationError("2x1 promotion must not have discount_percent");
    }

    if (input.name !== undefined && input.name.trim().length === 0) {
      throw new ValidationError("Promotion name must not be empty");
    }

    const resolvedScope = input.scope ?? (input.product_id ? "product" : existing.scope);
    const resolvedProductId =
      resolvedScope === "store"
        ? null
        : input.product_id ?? existing.product_id ?? null;

    if (resolvedScope === "store" && input.product_id) {
      throw new ValidationError(
        "Store-wide promotions must not include product_id",
      );
    }

    if (resolvedScope === "product" && !resolvedProductId) {
      throw new ValidationError(
        "Product promotions must include product_id",
      );
    }

    if (
      input.start_date &&
      input.end_date &&
      input.start_date > input.end_date
    ) {
      throw new ValidationError("start_date must be on or before end_date");
    }

    if (input.weekdays) {
      for (const day of input.weekdays) {
        if (day < 1 || day > 7) {
          throw new ValidationError("Weekdays must be between 1 and 7");
        }
      }
    }

    return this.promoRepo.update(id, {
      ...input,
      scope: resolvedScope,
      product_id: resolvedProductId,
    }) as Promise<Promotion>;
  }
}
