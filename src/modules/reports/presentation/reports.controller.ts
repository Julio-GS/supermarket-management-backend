import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/infrastructure/jwt-auth.guard";
import { ReportQueryDto, ReportResponseDto } from "./report.dto";
import { GetBusinessReportUseCase } from "../application/get-business-report.use-case";
import { BusinessReport } from "../domain/report.entity";
import {
  CreateProviderPurchaseDto,
  UpdateProviderPurchaseDto,
  ProviderPurchaseResponseDto,
  ProviderPurchaseReportQueryDto,
  ProviderPurchaseReportResponseDto,
} from "./provider-purchase.dto";
import { CreateProviderPurchaseUseCase } from "../application/create-provider-purchase.use-case";
import { ListProviderPurchasesUseCase } from "../application/list-provider-purchases.use-case";
import { UpdateProviderPurchaseUseCase } from "../application/update-provider-purchase.use-case";
import { DeleteProviderPurchaseUseCase } from "../application/delete-provider-purchase.use-case";
import { GetProviderPurchaseReportUseCase } from "../application/get-provider-purchase-report.use-case";
import { ProviderPurchase, ProviderPurchaseReport } from "../domain/provider-purchase.entity";

function toReportResponse(report: BusinessReport): ReportResponseDto {
  return {
    window: report.window,
    range: report.range,
    totalCollectedAmount: report.totalCollectedAmount,
    paymentMethodBreakdown: report.paymentMethodBreakdown,
    topProducts: report.topProducts,
  };
}

function toProviderPurchaseResponse(entity: ProviderPurchase): ProviderPurchaseResponseDto {
  return {
    id: entity.id,
    provider_name: entity.provider_name,
    amount: entity.amount,
    payment_method: entity.payment_method,
    created_at: entity.created_at,
    updated_at: entity.updated_at,
  };
}

function toProviderPurchaseReportResponse(
  report: ProviderPurchaseReport,
): ProviderPurchaseReportResponseDto {
  return {
    window: report.window,
    range: report.range,
    totalAmount: report.totalAmount,
    purchaseCount: report.purchaseCount,
    paymentMethodBreakdown: report.paymentMethodBreakdown,
  };
}

@Controller("reports")
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly getBusinessReport: GetBusinessReportUseCase,
    private readonly createProviderPurchase: CreateProviderPurchaseUseCase,
    private readonly listProviderPurchases: ListProviderPurchasesUseCase,
    private readonly updateProviderPurchase: UpdateProviderPurchaseUseCase,
    private readonly deleteProviderPurchase: DeleteProviderPurchaseUseCase,
    private readonly getProviderPurchaseReport: GetProviderPurchaseReportUseCase,
  ) {}

  @Get()
  async getReport(
    @Query() query: ReportQueryDto,
  ): Promise<ReportResponseDto> {
    const report = await this.getBusinessReport.execute(query.window);
    return toReportResponse(report);
  }

  @Post("provider-purchases")
  async createProviderPurchaseHandler(
    @Body() dto: CreateProviderPurchaseDto,
  ): Promise<ProviderPurchaseResponseDto> {
    const entity = await this.createProviderPurchase.execute({
      provider_name: dto.provider_name,
      amount: dto.amount,
      payment_method: dto.payment_method,
    });
    return toProviderPurchaseResponse(entity);
  }

  @Get("provider-purchases")
  async listProviderPurchasesHandler(): Promise<ProviderPurchaseResponseDto[]> {
    const entities = await this.listProviderPurchases.execute();
    return entities.map(toProviderPurchaseResponse);
  }

  @Put("provider-purchases/:id")
  async updateProviderPurchaseHandler(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderPurchaseDto,
  ): Promise<ProviderPurchaseResponseDto> {
    const entity = await this.updateProviderPurchase.execute(id, {
      provider_name: dto.provider_name,
      amount: dto.amount,
      payment_method: dto.payment_method,
    });
    return toProviderPurchaseResponse(entity);
  }

  @Delete("provider-purchases/:id")
  @HttpCode(204)
  async deleteProviderPurchaseHandler(
    @Param("id", ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.deleteProviderPurchase.execute(id);
  }

  @Get("provider-purchases/report")
  async getProviderPurchaseReportHandler(
    @Query() query: ProviderPurchaseReportQueryDto,
  ): Promise<ProviderPurchaseReportResponseDto> {
    const report = await this.getProviderPurchaseReport.execute(query.window);
    return toProviderPurchaseReportResponse(report);
  }
}
