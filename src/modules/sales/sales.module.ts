import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProductsModule } from "../products/products.module";
import { PromotionsModule } from "../promotions/promotions.module";
import { InventoryModule } from "../inventory/inventory.module";
import { SalesController } from "./presentation/sales.controller";
import { SaleRepositoryPort } from "./application/sale.repository.port";
import { TypeOrmSaleRepository } from "./infrastructure/typeorm-sale.repository";
import { SaleEntity } from "./infrastructure/typeorm-sale.entity";
import { SaleItemEntity } from "./infrastructure/typeorm-sale-item.entity";
import { SalePaymentMethodEntity } from "./infrastructure/typeorm-sale-payment-method.entity";
import { SaleTicketAllocationEntity } from "./infrastructure/typeorm-sale-ticket-allocation.entity";
import { CreateSaleUseCase } from "./application/create-sale.use-case";
import { SaleItemResolver } from "./application/sale-item-resolver";
import { SaleFiscalOrchestrator } from "./application/sale-fiscal-orchestrator";
import { ListSalesUseCase } from "./application/list-sales.use-case";
import { GetSaleUseCase } from "./application/get-sale.use-case";
import { IssueArcaInvoiceUseCase } from "./application/issue-arca-invoice.use-case";
import { RetryArcaInvoiceUseCase } from "./application/retry-arca-invoice.use-case";
import { ArcaInvoicePort } from "./application/arca-invoice.port";
import { ArcaInvoiceAdapter } from "./infrastructure/arca-invoice.adapter";
import { ArcaAlertPort } from "./application/arca-alert.port";
import { ArcaLoggerAlertAdapter } from "./infrastructure/arca-logger-alert.adapter";
import { ReadCacheModule } from "../../shared/cache/read-cache.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SaleEntity,
      SaleItemEntity,
      SalePaymentMethodEntity,
      SaleTicketAllocationEntity,
    ]),
    ProductsModule,
    PromotionsModule,
    InventoryModule,
    ReadCacheModule,
  ],
  controllers: [SalesController],
  exports: [SaleRepositoryPort],
  providers: [
    {
      provide: SaleRepositoryPort,
      useClass: TypeOrmSaleRepository,
    },
    {
      provide: ArcaInvoicePort,
      useClass: ArcaInvoiceAdapter,
    },
    {
      provide: ArcaAlertPort,
      useClass: ArcaLoggerAlertAdapter,
    },
    CreateSaleUseCase,
    SaleItemResolver,
    SaleFiscalOrchestrator,
    ListSalesUseCase,
    GetSaleUseCase,
    IssueArcaInvoiceUseCase,
    RetryArcaInvoiceUseCase,
  ],
})
export class SalesModule {}
