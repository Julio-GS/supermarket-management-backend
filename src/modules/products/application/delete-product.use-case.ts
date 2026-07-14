import { Injectable } from "@nestjs/common";
import { ProductRepositoryPort } from "./product.repository.port";
import { NotFoundError, ConflictError } from "../../../shared/errors/domain.error";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { PRODUCT_READ_CACHE_POLICY } from "../../../shared/cache/cache-policy";

@Injectable()
export class DeleteProductUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly cache: ReadCachePort,
  ) {}

  async execute(id: string): Promise<void> {
    const existing = await this.products.findById(id);
    if (!existing) {
      throw new NotFoundError("Product not found");
    }
    if (existing.is_protected) {
      throw new ConflictError(
        "Cannot delete a protected special-code product",
      );
    }
    await this.products.delete(id);
    await this.cache.deleteByPrefix(PRODUCT_READ_CACHE_POLICY.prefix);
  }
}
