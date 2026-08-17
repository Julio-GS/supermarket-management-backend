import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProductsModule } from "../products/products.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PromotionsModule } from "../promotions/promotions.module";
import { ReportsModule } from "../reports/reports.module";
import { UsersModule } from "../users/users.module";
import { SalesModule } from "../sales/sales.module";
import { LabelPrinterModule } from "../label-printer/label-printer.module";
import { DatabaseModule } from "../../shared/database/database.module";
import { BootstrapController } from "./presentation/bootstrap.controller";
import { BootstrapUseCase } from "./application/bootstrap.use-case";
import { SyncController } from "./presentation/sync.controller";
import { AuthRevalidateController } from "./presentation/auth-revalidate.controller";
import { PushUseCase } from "./application/push.use-case";
import { PullUseCase } from "./application/pull.use-case";
import { RevalidateUseCase } from "./application/revalidate.use-case";
import { IdempotencyService } from "./application/idempotency.service";
import { IdempotencyRecordEntity } from "./infrastructure/idempotency-record.entity";
import { SyncTombstoneEntity } from "./infrastructure/sync-tombstone.entity";
import { SaleSyncHandler } from "./application/handlers/sale-sync.handler";
import { StockSyncHandler } from "./application/handlers/stock-sync.handler";
import { ProductSyncHandler } from "./application/handlers/product-sync.handler";
import { PromotionSyncHandler } from "./application/handlers/promotion-sync.handler";
import { ProviderPurchaseSyncHandler } from "./application/handlers/provider-purchase-sync.handler";
import {
  SYNC_OPERATION_HANDLERS,
  SyncOperationHandler,
} from "./application/ports/sync-operation-handler.port";

export const syncOperationHandlersProvider = {
  provide: SYNC_OPERATION_HANDLERS,
  useFactory: (
    sale: SaleSyncHandler,
    stock: StockSyncHandler,
    product: ProductSyncHandler,
    promotion: PromotionSyncHandler,
    providerPurchase: ProviderPurchaseSyncHandler,
  ): SyncOperationHandler[] => [
    sale,
    stock,
    product,
    promotion,
    providerPurchase,
  ],
  inject: [
    SaleSyncHandler,
    StockSyncHandler,
    ProductSyncHandler,
    PromotionSyncHandler,
    ProviderPurchaseSyncHandler,
  ],
};

@Module({
  imports: [
    TypeOrmModule.forFeature([IdempotencyRecordEntity, SyncTombstoneEntity]),
    ProductsModule,
    InventoryModule,
    PromotionsModule,
    ReportsModule,
    UsersModule,
    SalesModule,
    LabelPrinterModule,
    DatabaseModule,
  ],
  controllers: [BootstrapController, SyncController, AuthRevalidateController],
  providers: [
    BootstrapUseCase,
    PushUseCase,
    PullUseCase,
    RevalidateUseCase,
    IdempotencyService,
    SaleSyncHandler,
    StockSyncHandler,
    ProductSyncHandler,
    PromotionSyncHandler,
    ProviderPurchaseSyncHandler,
    syncOperationHandlersProvider,
  ],
})
export class SyncModule {}
