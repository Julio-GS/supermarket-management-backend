import { Injectable } from "@nestjs/common";
import {
  ProductRepositoryPort,
  ProductUpdateInput,
} from "./product.repository.port";
import { Product } from "../domain/product.entity";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from "../../../shared/errors/domain.error";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { PRODUCT_READ_CACHE_POLICY } from "../../../shared/cache/cache-policy";
import { containsReservedCode } from "../domain/special-product-codes";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { TransactionRunnerPort } from "../../../shared/database/transaction-runner.port";

@Injectable()
export class UpdateProductUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly cache: ReadCachePort,
    private readonly inventory: InventoryRepositoryPort,
    private readonly transactionRunner: TransactionRunnerPort,
  ) {}

  async execute(id: string, input: ProductUpdateInput): Promise<Product> {
    const existing = await this.products.findById(id);
    if (!existing) {
      throw new NotFoundError("Product not found");
    }

    // Protected products must not have their barcode mapping reassigned
    if (existing.is_protected && input.codigos !== undefined) {
      throw new ValidationError(
        "Cannot change barcodes of a protected special-code product",
      );
    }

    if (input.codigos && containsReservedCode(input.codigos)) {
      throw new ValidationError(
        "Cannot assign reserved special codes (1-9) to a product",
      );
    }

    if (input.codigos && input.codigos.length > 0) {
      const hasDuplicates = await this.products.existsAnyBarcode(
        input.codigos,
        id,
      );
      if (hasDuplicates) {
        throw new ConflictError("One or more barcodes already exist");
      }
    }

    const updated = await this.transactionRunner.run(async (runner) => {
      const product = await this.products.update(id, input, runner);
      if (!product) throw new NotFoundError("Product not found");
      if (!existing.maneja_stock && product.maneja_stock) {
        await this.inventory.createBalance(id, 0, runner);
      }
      return product;
    });
    await this.cache.deleteByPrefix(PRODUCT_READ_CACHE_POLICY.prefix);
    return updated;
  }
}
