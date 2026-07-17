import { Injectable } from "@nestjs/common";
import {
  InventoryRepositoryPort,
  StockAdjustInput,
} from "./inventory.repository.port";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { StockMovement } from "../domain/inventory.entity";
import { NotFoundError, ValidationError } from "../../../shared/errors/domain.error";

@Injectable()
export class AdjustStockUseCase {
  constructor(
    private readonly inventoryRepo: InventoryRepositoryPort,
    private readonly products: ProductRepositoryPort,
  ) {}

  async execute(input: StockAdjustInput): Promise<StockMovement> {
    if (!Number.isInteger(input.quantity)) {
      throw new ValidationError("Stock adjustment quantity must be a whole integer");
    }

    const product = await this.products.findById(input.product_id);
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
      input.reason,
    );
  }
}
