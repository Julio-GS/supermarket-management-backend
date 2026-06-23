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
import {
  CreateProductDto,
  UpdateProductDto,
  ProductResponseDto,
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
import { Page, mapPage } from "../../../shared/read-model/page";

function toProductResponse(product: Product): ProductResponseDto {
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
      return mapPage(page, toProductResponse);
    }
    const products = await this.listProducts.execute({ search: query.search });
    return products.map(toProductResponse);
  }

  @Get(":id")
  async get(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ProductResponseDto> {
    const product = await this.getProduct.execute(id);
    return toProductResponse(product);
  }

  @Put(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    const product = await this.updateProduct.execute(id, dto);
    return toProductResponse(product);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteProduct.execute(id);
  }
}
