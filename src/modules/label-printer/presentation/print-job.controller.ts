import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/infrastructure/jwt-auth.guard";
import {
  CreatePrintJobDto,
  ClaimJobDto,
  ClaimBatchDto,
  CompleteJobDto,
  FailJobDto,
  PrintJobResponseDto,
} from "./print-job.dto";
import { CreatePrintJobUseCase } from "../application/create-print-job.use-case";
import { ListPendingJobsUseCase } from "../application/list-pending-jobs.use-case";
import { ClaimJobUseCase } from "../application/claim-job.use-case";
import { ClaimBatchUseCase } from "../application/claim-batch.use-case";
import { CompleteJobUseCase } from "../application/complete-job.use-case";
import { FailJobUseCase } from "../application/fail-job.use-case";
import { PrintJob } from "../domain/print-job.entity";

function toResponse(job: PrintJob): PrintJobResponseDto {
  return {
    id: job.id,
    product_id: job.product_id,
    sku: job.sku,
    product_name: job.product_name,
    sale_price: job.sale_price,
    status: job.status,
    claimed_by: job.claimed_by,
    claimed_at: job.claimed_at?.toISOString() ?? null,
    lease_expires_at: job.lease_expires_at?.toISOString() ?? null,
    completed_at: job.completed_at?.toISOString() ?? null,
    failed_at: job.failed_at?.toISOString() ?? null,
    fail_reason: job.fail_reason,
    created_at: job.created_at.toISOString(),
    updated_at: job.updated_at.toISOString(),
  };
}

@Controller("label-print-jobs")
@UseGuards(JwtAuthGuard)
export class PrintJobController {
  constructor(
    private readonly createJob: CreatePrintJobUseCase,
    private readonly listPending: ListPendingJobsUseCase,
    private readonly claimJob: ClaimJobUseCase,
    private readonly claimBatchUseCase: ClaimBatchUseCase,
    private readonly completeJob: CompleteJobUseCase,
    private readonly failJob: FailJobUseCase,
  ) {}

  @Post()
  async create(@Body() dto: CreatePrintJobDto): Promise<PrintJobResponseDto> {
    const job = await this.createJob.execute(dto);
    return toResponse(job);
  }

  @Get("pending")
  async pending(): Promise<PrintJobResponseDto[]> {
    const jobs = await this.listPending.execute();
    return jobs.map(toResponse);
  }

  @Post("claim")
  async claim(@Body() dto: ClaimJobDto): Promise<PrintJobResponseDto | null> {
    const job = await this.claimJob.execute(dto.installation, dto.lease_ms);
    return job ? toResponse(job) : null;
  }

  @Post("claim-batch")
  async claimBatch(@Body() dto: ClaimBatchDto): Promise<PrintJobResponseDto[]> {
    const jobs = await this.claimBatchUseCase.execute(
      dto.installation,
      dto.lease_ms ?? 300000,
      dto.limit,
    );
    return jobs.map(toResponse);
  }

  @Post(":id/complete")
  async complete(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CompleteJobDto,
  ): Promise<PrintJobResponseDto> {
    const job = await this.completeJob.execute(id, dto.installation);
    return toResponse(job);
  }

  @Post(":id/fail")
  async fail(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: FailJobDto,
  ): Promise<PrintJobResponseDto> {
    const job = await this.failJob.execute(id, dto.installation, dto.reason);
    return toResponse(job);
  }
}
