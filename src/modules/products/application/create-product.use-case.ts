import { Injectable } from "@nestjs/common";
import {
  ProductRepositoryPort,
  ProductCreateInput,
} from "./product.repository.port";
import { Product } from "../domain/product.entity";
import { ConflictError, ValidationError } from "../../../shared/errors/domain.error";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { PRODUCT_READ_CACHE_POLICY } from "../../../shared/cache/cache-policy";
import { containsReservedCode } from "../domain/special-product-codes";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { TransactionRunnerPort } from "../../../shared/database/transaction-runner.port";

@Injectable()
export class CreateProductUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly cache: ReadCachePort,
    private readonly inventory: InventoryRepositoryPort,
    private readonly transactionRunner: TransactionRunnerPort,
  ) {}

  async execute(input: ProductCreateInput): Promise<Product> {
    if (input.codigos && containsReservedCode(input.codigos)) {
      throw new ValidationError(
        "Cannot create a product with reserved special codes (1-9)",
      );
    }

    const hasDuplicates = await this.products.existsAnyBarcode(input.codigos);
    if (hasDuplicates) {
      throw new ConflictError("One or more barcodes already exist");
    }
    const product = await this.transactionRunner.run(async (runner) => {
      const created = await this.products.create(input, runner);
      if (created.maneja_stock) {
        await this.inventory.createBalance(created.id, 0, runner);
      }
      return created;
    });
    await this.cache.deleteByPrefix(PRODUCT_READ_CACHE_POLICY.prefix);
    return product;
  }
}
