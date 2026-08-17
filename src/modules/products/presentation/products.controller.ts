import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
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
  ProductCreateResponseDto,
  ProductListQueryDto,
} from "./product.dto";
import { CreateProductUseCase } from "../application/create-product.use-case";
import { UpdateProductUseCase } from "../application/update-product.use-case";
import { DeleteProductUseCase } from "../application/delete-product.use-case";
import { ValidationError } from "../../../shared/errors/domain.error";
import { Page } from "../../../shared/read-model/page";
import { ProductReadModelService } from "../application/product-read-model.service";

@Controller("products")
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(
    private readonly createProduct: CreateProductUseCase,
    private readonly updateProduct: UpdateProductUseCase,
    private readonly deleteProduct: DeleteProductUseCase,
    private readonly productReadModel: ProductReadModelService,
  ) {}

  @Post()
  async create(
    @Body() dto: CreateProductDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<ProductCreateResponseDto> {
    const trimmedKey = idempotencyKey?.trim();
    if (!trimmedKey) {
      throw new ValidationError("Idempotency-Key header is required");
    }
    const result = await this.createProduct.execute(dto, trimmedKey);
    return result as unknown as ProductCreateResponseDto;
  }

  @Get()
  async list(
    @Query() query: ProductListQueryDto,
  ): Promise<ProductResponseDto[] | Page<ProductResponseDto>> {
    return this.productReadModel.list(query);
  }

  @Get("code/:code")
  async getByCode(@Param("code") code: string): Promise<ProductResponseDto> {
    const trimmedCode = code.trim();
    if (trimmedCode.length === 0) {
      throw new ValidationError("Product code must not be empty");
    }
    return this.productReadModel.getByCode(trimmedCode);
  }

  @Get(":id")
  async get(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<ProductResponseDto> {
    return this.productReadModel.get(id);
  }

  @Put(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    const updated = await this.updateProduct.execute(id, dto);
    return this.productReadModel.enrich(updated);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteProduct.execute(id);
  }
}
