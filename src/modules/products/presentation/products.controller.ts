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
import { Product } from "../domain/product.entity";
import {
  hasPaginationQuery,
  normalizePagination,
} from "../../../shared/read-model/pagination.dto";
import { Page } from "../../../shared/read-model/page";

function toProductResponse(
  product: Product,
  promotions?: ProductPromotionSummaryDto[] | null,
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
    promotions: promotions ?? null,
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
    if (hasPaginationQuery(query)) {
      const page = await this.listProducts.executePage(
        normalizePagination(query, { search: query.search }),
      );
      const productIds = page.data.map((p) => p.id);
      const promotionsById = await this.loadPromotionsMap(productIds);
      const mapped = page.data.map((p) =>
        toProductResponse(p, promotionsById.get(p.id)),
      );
      return { data: mapped, meta: page.meta } as Page<ProductResponseDto>;
    }
    const products = await this.listProducts.execute({ search: query.search });
    const productIds = products.map((p) => p.id);
    const promotionsById = await this.loadPromotionsMap(productIds);
    return products.map((p) =>
      toProductResponse(p, promotionsById.get(p.id)),
    );
  }

  @Get(":id")
  async get(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ProductResponseDto> {
    const product = await this.getProduct.execute(id);
    const promotionsById = await this.loadPromotionsMap([id]);
    return toProductResponse(product, promotionsById.get(id));
  }

  @Put(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    const product = await this.updateProduct.execute(id, dto);
    const promotionsById = await this.loadPromotionsMap([id]);
    return toProductResponse(product, promotionsById.get(id));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteProduct.execute(id);
  }

  private async loadPromotionsMap(
    productIds: string[],
  ): Promise<Map<string, ProductPromotionSummaryDto[]>> {
    const promotions = await this.promotionRepo.findActiveByProductIds(
      productIds,
    );
    const map = new Map<string, ProductPromotionSummaryDto[]>();
    for (const promo of promotions) {
      if (!promo.product_id) continue; // store-wide promos have no product_id
      const pid = promo.product_id;
      const list = map.get(pid) ?? [];
      list.push({
        id: promo.id,
        type: promo.type,
        discount_percent: promo.discount_percent ?? null,
        weekdays: promo.weekdays ?? null,
      });
      map.set(pid, list);
    }
    return map;
  }
}
