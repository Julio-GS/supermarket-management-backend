import { Injectable } from "@nestjs/common";
import {
  ProductListOptions,
  ProductRepositoryPort,
} from "./product.repository.port";
import { Product } from "../domain/product.entity";
import { Page, PaginationOptions } from "../../../shared/read-model/page";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { buildCacheKey } from "../../../shared/cache/cache-key";
import { PRODUCT_READ_CACHE_POLICY } from "../../../shared/cache/cache-policy";
import { normalizeSearch } from "../../../shared/read-model/pagination.dto";

@Injectable()
export class ListProductsUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly cache: ReadCachePort,
  ) {}

  async execute(options: ProductListOptions = {}): Promise<Product[]> {
    const params = { search: normalizeSearch(options.search) };
    const key = buildCacheKey(
      PRODUCT_READ_CACHE_POLICY.prefix,
      "list:all",
      params,
    );
    return this.cache.getOrSet(key, PRODUCT_READ_CACHE_POLICY.ttlMs, () =>
      this.products.findAll(params),
    );
  }

  async executePage(options: PaginationOptions): Promise<Page<Product>> {
    const params = { ...options, search: normalizeSearch(options.search) };
    const key = buildCacheKey(
      PRODUCT_READ_CACHE_POLICY.prefix,
      "list:page",
      params,
    );
    return this.cache.getOrSet(key, PRODUCT_READ_CACHE_POLICY.ttlMs, () =>
      this.products.findPage(params),
    );
  }
}
