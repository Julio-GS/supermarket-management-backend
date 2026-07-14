import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Put,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/infrastructure/jwt-auth.guard";
import { PromotionRepositoryPort } from "../../promotions/application/promotion.repository.port";
import {
  CreateProductDto,
  UpdateProductDto,
  ProductResponseDto,
  ProductPromotionSummaryDto,
  ProductListQueryDto,
} from "./product.dto";
import { CreateProductUseCase } from "../application/create-product.use-case";
import { ListProductsUseCase } from "../application/list-products.use-case";
import { GetProductUseCase } from "../application/get-product.use-case";
import { UpdateProductUseCase } from "../application/update-product.use-case";
import { DeleteProductUseCase } from "../application/delete-product.use-case";
import { GetProductByCodeUseCase } from "../application/get-product-by-code.use-case";
import { Product } from "../domain/product.entity";
import {
  hasPaginationQuery,
  normalizePagination,
} from "../../../shared/read-model/pagination.dto";
import { Page } from "../../../shared/read-model/page";
import { argentinaNow } from "../../promotions/application/promotion-reference-date";

function toProductResponse(
  product: Product,
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
    promotions: promotions ?? null,
    store_promotions: storePromotions ?? null,
    created_at: product.created_at,
    updated_at: product.updated_at,
  };
}

@Controller("products")
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(
    private readonly createProduct: CreateProductUseCase,
    private readonly listProducts: ListProductsUseCase,
    private readonly getProduct: GetProductUseCase,
    private readonly updateProduct: UpdateProductUseCase,
    private readonly deleteProduct: DeleteProductUseCase,
    private readonly getProductByCode: GetProductByCodeUseCase,
    private readonly promotionRepo: PromotionRepositoryPort,
  ) {}

  @Post()
  async create(@Body() dto: CreateProductDto): Promise<ProductResponseDto> {
    const product = await this.createProduct.execute(dto);
    return toProductResponse(product);
  }

  @Get()
  async list(
    @Query() query: ProductListQueryDto,
  ): Promise<ProductResponseDto[] | Page<ProductResponseDto>> {
    const now = argentinaNow();

    if (hasPaginationQuery(query)) {
      const page = await this.listProducts.executePage(
        normalizePagination(query, { search: query.search }),
      );
      const productIds = page.data.map((p) => p.id);
      const { promotionsById, storePromotions } =
        await this.loadPromotionsMap(productIds, now);
      const storeList =
        storePromotions.length > 0 ? storePromotions : null;
      const mapped = page.data.map((p) =>
        toProductResponse(p, promotionsById.get(p.id), storeList),
      );
      return { data: mapped, meta: page.meta } as Page<ProductResponseDto>;
    }
    const products = await this.listProducts.execute({ search: query.search });
    const productIds = products.map((p) => p.id);
    const { promotionsById, storePromotions } =
      await this.loadPromotionsMap(productIds, now);
    const storeList =
      storePromotions.length > 0 ? storePromotions : null;
    return products.map((p) =>
      toProductResponse(p, promotionsById.get(p.id), storeList),
    );
  }

  @Get("code/:code")
  async getByCode(@Param("code") code: string): Promise<ProductResponseDto> {
    const product = await this.getProductByCode.execute(code);
    const { promotionsById, storePromotions } =
      await this.loadPromotionsMap([product.id], argentinaNow());
    const storeList =
      storePromotions.length > 0 ? storePromotions : null;
    return toProductResponse(product, promotionsById.get(product.id), storeList);
  }

  @Get(":id")
  async get(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ProductResponseDto> {
    const product = await this.getProduct.execute(id);
    const { promotionsById, storePromotions } =
      await this.loadPromotionsMap([id], argentinaNow());
    const storeList =
      storePromotions.length > 0 ? storePromotions : null;
    return toProductResponse(product, promotionsById.get(id), storeList);
  }

  @Put(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    const product = await this.updateProduct.execute(id, dto);
    const { promotionsById, storePromotions } =
      await this.loadPromotionsMap([id], argentinaNow());
    const storeList =
      storePromotions.length > 0 ? storePromotions : null;
    return toProductResponse(product, promotionsById.get(id), storeList);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteProduct.execute(id);
  }

  private async loadPromotionsMap(
    productIds: string[],
    now: Date,
  ): Promise<{
    promotionsById: Map<string, ProductPromotionSummaryDto[]>;
    storePromotions: ProductPromotionSummaryDto[];
  }> {
    const promotions = await this.promotionRepo.findActiveByProductIds(
      productIds,
      now,
    );
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
}
