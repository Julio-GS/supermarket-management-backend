import { Injectable } from "@nestjs/common";
import {
  InventoryRepositoryPort,
  StockAdjustInput,
} from "./inventory.repository.port";
import { StockProductLookupPort } from "./stock-product-lookup.port";
import { StockMovement } from "../domain/inventory.entity";
import { NotFoundError, ValidationError } from "../../../shared/errors/domain.error";

export function normalizeStockAdjustmentReason(
  reason: string | null | undefined,
): string | null {
  if (reason == null) return null;
  return reason.trim().length === 0 ? null : reason;
}

@Injectable()
export class AdjustStockUseCase {
  constructor(
    private readonly inventoryRepo: InventoryRepositoryPort,
    private readonly productLookup: StockProductLookupPort,
  ) {}

  async execute(input: StockAdjustInput): Promise<StockMovement> {
    if (!Number.isInteger(input.quantity)) {
      throw new ValidationError("Stock adjustment quantity must be a whole integer");
    }

    if (input.quantity === 0) {
      throw new ValidationError("Stock adjustment quantity must be nonzero");
    }

    const product = await this.productLookup.findById(input.product_id);
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    if (!product.maneja_stock) {
      throw new ValidationError(
        "Cannot adjust stock for a product that does not manage stock",
      );
    }

    return this.inventoryRepo.adjustBalance(
      input.product_id,
      input.quantity,
      "adjustment",
      undefined,
      normalizeStockAdjustmentReason(input.reason),
    );
  }
}
