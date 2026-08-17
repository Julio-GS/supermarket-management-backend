import { IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { REPORT_WINDOWS, ReportWindow } from "../domain/report.entity";

export class ReportQueryDto {
  @IsOptional()
  @IsIn(REPORT_WINDOWS as unknown as string[])
  @IsNotEmpty()
  window?: ReportWindow;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}

export class PaymentMethodBreakdownDto {
  @IsString()
  method!: string;

  @IsString()
  amount!: string;
}

export class TopProductDto {
  @IsString()
  productId!: string;

  @IsString()
  detalle!: string;

  units_sold!: number;
}

export class FiscalReportBucketDto {
  @IsString()
  amount!: string;

  sale_count!: number;
}

export class FiscalReportGroupingDto {
  issued!: FiscalReportBucketDto;

  none!: FiscalReportBucketDto;

  incident!: FiscalReportBucketDto;
}

export class ReportResponseDto {
  @IsString()
  window!: string;

  range!: { startsAt: string; endsAt: string };

  @IsString()
  totalCollectedAmount!: string;

  paymentMethodBreakdown!: PaymentMethodBreakdownDto[];

  topProducts!: TopProductDto[];

  fiscal!: FiscalReportGroupingDto;
}
