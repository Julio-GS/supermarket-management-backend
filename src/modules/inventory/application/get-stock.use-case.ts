import { Injectable } from "@nestjs/common";
import { InventoryRepositoryPort } from "./inventory.repository.port";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { NotFoundError } from "../../../shared/errors/domain.error";

export interface StockResponse {
  stock_actual: number | null;
}

@Injectable()
export class GetStockUseCase {
  constructor(
    private readonly inventoryRepo: InventoryRepositoryPort,
    private readonly products: ProductRepositoryPort,
  ) {}

  async execute(productId: string): Promise<StockResponse> {
    const product = await this.products.findById(productId);
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    if (!product.maneja_stock) {
      return { stock_actual: null };
    }

    const balance = await this.inventoryRepo.findBalance(productId);
    return { stock_actual: balance?.stock_actual ?? 0 };
  }
}
