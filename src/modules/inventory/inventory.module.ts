import { forwardRef, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProductsModule } from "../products/products.module";
import { InventoryBalanceEntity } from "./infrastructure/typeorm-inventory-balance.entity";
import { StockMovementEntity } from "./infrastructure/typeorm-stock-movement.entity";
import { InventoryRepositoryPort } from "./application/inventory.repository.port";
import { TypeOrmInventoryRepository } from "./infrastructure/typeorm-inventory.repository";
import { GetStockUseCase } from "./application/get-stock.use-case";
import { AdjustStockUseCase } from "./application/adjust-stock.use-case";
import { StockController } from "./presentation/stock.controller";
import { DatabaseModule } from "../../shared/database/database.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryBalanceEntity, StockMovementEntity]),
    DatabaseModule,
    forwardRef(() => ProductsModule),
  ],
  controllers: [StockController],
  providers: [
    {
      provide: InventoryRepositoryPort,
      useClass: TypeOrmInventoryRepository,
    },
    GetStockUseCase,
    AdjustStockUseCase,
  ],
  exports: [InventoryRepositoryPort],
})
export class InventoryModule {}
