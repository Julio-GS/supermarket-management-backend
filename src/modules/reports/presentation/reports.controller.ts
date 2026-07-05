import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/infrastructure/jwt-auth.guard";
import { ReportQueryDto, ReportResponseDto } from "./report.dto";
import { GetBusinessReportUseCase } from "../application/get-business-report.use-case";
import { BusinessReport } from "../domain/report.entity";

function toReportResponse(report: BusinessReport): ReportResponseDto {
  return {
    window: report.window,
    range: report.range,
    totalCollectedAmount: report.totalCollectedAmount,
    paymentMethodBreakdown: report.paymentMethodBreakdown,
    topProducts: report.topProducts,
  };
}

@Controller("reports")
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly getBusinessReport: GetBusinessReportUseCase,
  ) {}

  @Get()
  async getReport(
    @Query() query: ReportQueryDto,
  ): Promise<ReportResponseDto> {
    const report = await this.getBusinessReport.execute(query.window);
    return toReportResponse(report);
  }
}
