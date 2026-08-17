import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PrintJobEntity } from "./infrastructure/typeorm-print-job.entity";
import { PrintJobRepositoryPort } from "./application/print-job.repository.port";
import { TypeOrmPrintJobRepository } from "./infrastructure/typeorm-print-job.repository";
import { CreatePrintJobUseCase } from "./application/create-print-job.use-case";
import { ListPendingJobsUseCase } from "./application/list-pending-jobs.use-case";
import { ClaimJobUseCase } from "./application/claim-job.use-case";
import { ClaimBatchUseCase } from "./application/claim-batch.use-case";
import { ClaimBatchContinueUseCase } from "./application/claim-batch-continue.use-case";
import { ClaimBatchCursorService } from "./application/claim-batch-cursor.service";
import { BlockJobUseCase } from "./application/block-job.use-case";
import { CompleteJobUseCase } from "./application/complete-job.use-case";
import { FailJobUseCase } from "./application/fail-job.use-case";
import { AutoLabelJobService } from "./application/auto-label-job.service";
import { PrintJobController } from "./presentation/print-job.controller";

@Module({
  imports: [TypeOrmModule.forFeature([PrintJobEntity])],
  controllers: [PrintJobController],
  providers: [
    {
      provide: PrintJobRepositoryPort,
      useClass: TypeOrmPrintJobRepository,
    },
    CreatePrintJobUseCase,
    ListPendingJobsUseCase,
    ClaimJobUseCase,
    ClaimBatchUseCase,
    ClaimBatchContinueUseCase,
    ClaimBatchCursorService,
    BlockJobUseCase,
    CompleteJobUseCase,
    FailJobUseCase,
    AutoLabelJobService,
  ],
  exports: [PrintJobRepositoryPort, AutoLabelJobService],
})
export class LabelPrinterModule {}
