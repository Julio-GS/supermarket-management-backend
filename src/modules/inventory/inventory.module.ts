import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { InventoryBalanceEntity } from "./infrastructure/typeorm-inventory-balance.entity";
import { StockMovementEntity } from "./infrastructure/typeorm-stock-movement.entity";
import { InventoryRepositoryPort } from "./application/inventory.repository.port";
import { TypeOrmInventoryRepository } from "./infrastructure/typeorm-inventory.repository";
import { StockProductLookupPort } from "./application/stock-product-lookup.port";
import { TypeOrmStockProductLookupRepository } from "./infrastructure/typeorm-stock-product-lookup.repository";
import { GetStockUseCase } from "./application/get-stock.use-case";
import { AdjustStockUseCase } from "./application/adjust-stock.use-case";
import { StockController } from "./presentation/stock.controller";
import { DatabaseModule } from "../../shared/database/database.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryBalanceEntity, StockMovementEntity]),
    DatabaseModule,
  ],
  controllers: [StockController],
  providers: [
    {
      provide: InventoryRepositoryPort,
      useClass: TypeOrmInventoryRepository,
    },
    {
      provide: StockProductLookupPort,
      useClass: TypeOrmStockProductLookupRepository,
    },
    GetStockUseCase,
    AdjustStockUseCase,
  ],
  exports: [InventoryRepositoryPort],
})
export class InventoryModule {}
