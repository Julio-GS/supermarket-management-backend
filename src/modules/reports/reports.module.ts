import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReportsController } from "./presentation/reports.controller";
import { ReportRepositoryPort } from "./application/report.repository.port";
import { TypeOrmReportRepository } from "./infrastructure/typeorm-report.repository";
import { GetBusinessReportUseCase } from "./application/get-business-report.use-case";
import { TypeOrmProviderPurchaseEntity } from "./infrastructure/typeorm-provider-purchase.entity";
import { ProviderPurchaseRepositoryPort } from "./application/provider-purchase.repository.port";
import { TypeOrmProviderPurchaseRepository } from "./infrastructure/typeorm-provider-purchase.repository";
import { CreateProviderPurchaseUseCase } from "./application/create-provider-purchase.use-case";
import { ListProviderPurchasesUseCase } from "./application/list-provider-purchases.use-case";
import { UpdateProviderPurchaseUseCase } from "./application/update-provider-purchase.use-case";
import { DeleteProviderPurchaseUseCase } from "./application/delete-provider-purchase.use-case";
import { GetProviderPurchaseReportUseCase } from "./application/get-provider-purchase-report.use-case";
import { ReadCacheModule } from "../../shared/cache/read-cache.module";

@Module({
  imports: [
    ReadCacheModule,
    TypeOrmModule.forFeature([TypeOrmProviderPurchaseEntity]),
  ],
  controllers: [ReportsController],
  providers: [
    {
      provide: ReportRepositoryPort,
      useClass: TypeOrmReportRepository,
    },
    {
      provide: ProviderPurchaseRepositoryPort,
      useClass: TypeOrmProviderPurchaseRepository,
    },
    GetBusinessReportUseCase,
    CreateProviderPurchaseUseCase,
    ListProviderPurchasesUseCase,
    UpdateProviderPurchaseUseCase,
    DeleteProviderPurchaseUseCase,
    GetProviderPurchaseReportUseCase,
  ],
})
export class ReportsModule {}
