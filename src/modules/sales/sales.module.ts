import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ProductsModule } from "../products/products.module";
import { SalesController } from "./presentation/sales.controller";
import { SaleRepositoryPort } from "./application/sale.repository.port";
import { TypeOrmSaleRepository } from "./infrastructure/typeorm-sale.repository";
import { SaleEntity } from "./infrastructure/typeorm-sale.entity";
import { SaleItemEntity } from "./infrastructure/typeorm-sale-item.entity";
import { CreateSaleUseCase } from "./application/create-sale.use-case";
import { ListSalesUseCase } from "./application/list-sales.use-case";
import { GetSaleUseCase } from "./application/get-sale.use-case";
import { IssueArcaInvoiceUseCase } from "./application/issue-arca-invoice.use-case";
import { ArcaInvoicePort } from "./application/arca-invoice.port";
import { ArcaInvoiceAdapter } from "./infrastructure/arca-invoice.adapter";
import { ReadCacheModule } from "../../shared/cache/read-cache.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([SaleEntity, SaleItemEntity]),
    ProductsModule,
    ReadCacheModule,
  ],
  controllers: [SalesController],
  providers: [
    {
      provide: SaleRepositoryPort,
      useClass: TypeOrmSaleRepository,
    },
    {
      provide: ArcaInvoicePort,
      useClass: ArcaInvoiceAdapter,
    },
    CreateSaleUseCase,
    ListSalesUseCase,
    GetSaleUseCase,
    IssueArcaInvoiceUseCase,
  ],
})
export class SalesModule {}
