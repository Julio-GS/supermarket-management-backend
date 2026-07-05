import { IsIn, IsNotEmpty, IsString } from "class-validator";
import { REPORT_WINDOWS, ReportWindow } from "../domain/report.entity";

export class ReportQueryDto {
  @IsIn(REPORT_WINDOWS as unknown as string[])
  @IsNotEmpty()
  window!: ReportWindow;
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

  unitsSold!: number;
}

export class ReportResponseDto {
  @IsString()
  window!: string;

  range!: { startsAt: string; endsAt: string };

  @IsString()
  totalCollectedAmount!: string;

  paymentMethodBreakdown!: PaymentMethodBreakdownDto[];

  topProducts!: TopProductDto[];
}
