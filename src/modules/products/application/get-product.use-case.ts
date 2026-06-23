import { Injectable } from "@nestjs/common";
import { ProductRepositoryPort } from "./product.repository.port";
import { Product } from "../domain/product.entity";
import { NotFoundError } from "../../../shared/errors/domain.error";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { buildCacheKey } from "../../../shared/cache/cache-key";
import { PRODUCT_READ_CACHE_POLICY } from "../../../shared/cache/cache-policy";

@Injectable()
export class GetProductUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly cache: ReadCachePort,
  ) {}

  async execute(id: string): Promise<Product> {
    const key = buildCacheKey(PRODUCT_READ_CACHE_POLICY.prefix, "detail", {
      id,
    });
    const product = await this.cache.getOrSet(
      key,
      PRODUCT_READ_CACHE_POLICY.ttlMs,
      () => this.products.findById(id),
    );
    if (!product) {
      throw new NotFoundError("Product not found");
    }
    return product;
  }
}
