import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProductsController } from "./presentation/products.controller";
import { ProductRepositoryPort } from "./application/product.repository.port";
import { TypeOrmProductRepository } from "./infrastructure/typeorm-product.repository";
import { ProductEntity } from "./infrastructure/typeorm-product.entity";
import { ProductBarcodeEntity } from "./infrastructure/typeorm-product-barcode.entity";
import { CreateProductUseCase } from "./application/create-product.use-case";
import { ListProductsUseCase } from "./application/list-products.use-case";
import { GetProductUseCase } from "./application/get-product.use-case";
import { UpdateProductUseCase } from "./application/update-product.use-case";
import { DeleteProductUseCase } from "./application/delete-product.use-case";
import { ReadCacheModule } from "../../shared/cache/read-cache.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([ProductEntity, ProductBarcodeEntity]),
    ReadCacheModule,
  ],
  controllers: [ProductsController],
  providers: [
    {
      provide: ProductRepositoryPort,
      useClass: TypeOrmProductRepository,
    },
    CreateProductUseCase,
    ListProductsUseCase,
    GetProductUseCase,
    UpdateProductUseCase,
    DeleteProductUseCase,
  ],
  exports: [ProductRepositoryPort],
})
export class ProductsModule {}
