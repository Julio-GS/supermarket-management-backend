import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProductsModule } from "../products/products.module";
import { InventoryModule } from "../inventory/inventory.module";
import { PromotionsModule } from "../promotions/promotions.module";
import { ReportsModule } from "../reports/reports.module";
import { UsersModule } from "../users/users.module";
import { SalesModule } from "../sales/sales.module";
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

@Module({
  imports: [
    TypeOrmModule.forFeature([IdempotencyRecordEntity, SyncTombstoneEntity]),
    ProductsModule,
    InventoryModule,
    PromotionsModule,
    ReportsModule,
    UsersModule,
    SalesModule,
  ],
  controllers: [BootstrapController, SyncController, AuthRevalidateController],
  providers: [
    BootstrapUseCase,
    PushUseCase,
    PullUseCase,
    RevalidateUseCase,
    IdempotencyService,
  ],
})
export class SyncModule {}
