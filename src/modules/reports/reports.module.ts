import { Module } from "@nestjs/common";
import { ReportsController } from "./presentation/reports.controller";
import { ReportRepositoryPort } from "./application/report.repository.port";
import { TypeOrmReportRepository } from "./infrastructure/typeorm-report.repository";
import { GetBusinessReportUseCase } from "./application/get-business-report.use-case";
import { ReadCacheModule } from "../../shared/cache/read-cache.module";

@Module({
  imports: [ReadCacheModule],
  controllers: [ReportsController],
  providers: [
    {
      provide: ReportRepositoryPort,
      useClass: TypeOrmReportRepository,
    },
    GetBusinessReportUseCase,
  ],
})
export class ReportsModule {}
