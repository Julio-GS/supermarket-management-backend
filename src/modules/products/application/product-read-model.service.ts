import { Injectable } from "@nestjs/common";
import { ListProductsUseCase } from "./list-products.use-case";
import { GetProductUseCase } from "./get-product.use-case";
import { GetProductByCodeUseCase } from "./get-product-by-code.use-case";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { PromotionRepositoryPort } from "../../promotions/application/promotion.repository.port";
import { Product } from "../domain/product.entity";
import { Promotion } from "../../promotions/domain/promotion.entity";
import {
  ProductResponseDto,
  ProductPromotionSummaryDto,
  ProductListQueryDto,
} from "../presentation/product.dto";
import {
  hasPaginationQuery,
  normalizePagination,
} from "../../../shared/read-model/pagination.dto";
import { Page } from "../../../shared/read-model/page";
import { argentinaNow } from "../../promotions/application/promotion-reference-date";

@Injectable()
export class ProductReadModelService {
  constructor(
    private readonly listProducts: ListProductsUseCase,
    private readonly getProduct: GetProductUseCase,
    private readonly getProductByCode: GetProductByCodeUseCase,
    private readonly inventoryRepo: InventoryRepositoryPort,
    private readonly promotionRepo: PromotionRepositoryPort,
  ) {}

  async list(
    query: ProductListQueryDto,
  ): Promise<ProductResponseDto[] | Page<ProductResponseDto>> {
    if (hasPaginationQuery(query)) {
      const page = await this.listProducts.executePage(
        normalizePagination(query, { search: query.search }),
      );
      const enriched = await this.enrichMany(page.data);
      return { data: enriched, meta: page.meta } as Page<ProductResponseDto>;
    }
    const products = await this.listProducts.execute({ search: query.search });
    return this.enrichMany(products);
  }

  async get(id: string): Promise<ProductResponseDto> {
    const product = await this.getProduct.execute(id);
    return this.enrich(product);
  }

  async getByCode(code: string): Promise<ProductResponseDto> {
    const product = await this.getProductByCode.execute(code);
    return this.enrich(product);
  }

  async enrich(product: Product): Promise<ProductResponseDto> {
    const results = await this.enrichMany([product]);
    return results[0];
  }

  async enrichMany(products: Product[]): Promise<ProductResponseDto[]> {
    if (products.length === 0) return [];

    const productIds = products.map((p) => p.id);
    const now = argentinaNow();

    const stockByProductId =
      await this.inventoryRepo.getStockForProducts(productIds);
    const promotions = await this.promotionRepo.findActiveForProducts(
      productIds,
      "all",
      now,
    );

    const { promotionsById, storePromotions } =
      this.groupPromotions(promotions);
    const storeList =
      storePromotions.length > 0 ? storePromotions : null;

    return products.map((p) => {
      const stockActual = this.resolveStockActual(p, stockByProductId);
      return this.toResponse(
        p,
        stockActual,
        promotionsById.get(p.id) ?? null,
        storeList,
      );
    });
  }

  private resolveStockActual(
    product: Product,
    stockByProductId: Map<string, number>,
  ): number | null {
    if (!product.maneja_stock) return null;
    return stockByProductId.get(product.id) ?? 0;
  }

  private groupPromotions(promotions: Promotion[]): {
    promotionsById: Map<string, ProductPromotionSummaryDto[]>;
    storePromotions: ProductPromotionSummaryDto[];
  } {
    const promotionsById = new Map<string, ProductPromotionSummaryDto[]>();
    const storePromotions: ProductPromotionSummaryDto[] = [];

    for (const promo of promotions) {
      const dto: ProductPromotionSummaryDto = {
        id: promo.id,
        name: promo.name,
        description: promo.description ?? null,
        scope: promo.scope,
        type: promo.type,
        discount_percent: promo.discount_percent ?? null,
        start_date: promo.start_date?.toISOString() ?? null,
        end_date: promo.end_date?.toISOString() ?? null,
        weekdays: promo.weekdays ?? null,
      };

      if (promo.scope === "store") {
        storePromotions.push(dto);
      } else if (promo.product_id) {
        const list = promotionsById.get(promo.product_id) ?? [];
        list.push(dto);
        promotionsById.set(promo.product_id, list);
      }
    }

    return { promotionsById, storePromotions };
  }

  private toResponse(
    product: Product,
    stockActual: number | null,
    promotions?: ProductPromotionSummaryDto[] | null,
    storePromotions?: ProductPromotionSummaryDto[] | null,
  ): ProductResponseDto {
    return {
      id: product.id,
      detalle: product.detalle,
      costo_neto: product.costo_neto,
      costo_final: product.costo_final,
      iva: product.iva,
      cambio_costo: product.cambio_costo,
      cambio_precio: product.cambio_precio,
      etiqueta: product.etiqueta,
      facturable: product.facturable,
      maneja_stock: product.maneja_stock,
      codigos: product.codigos,
      pricing_mode: product.pricing_mode,
      is_protected: product.is_protected,
      stock_actual: stockActual,
      promotions: promotions ?? null,
      store_promotions: storePromotions ?? null,
      created_at: product.created_at,
      updated_at: product.updated_at,
    };
  }
}
