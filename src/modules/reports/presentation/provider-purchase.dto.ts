import {
  IsIn,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { REPORT_WINDOWS, ReportWindow } from "../domain/report.entity";

export class CreateProviderPurchaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  provider_name!: string;

  @IsNumberString()
  @IsNotEmpty()
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  payment_method?: string;
}

export class UpdateProviderPurchaseDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  provider_name?: string;

  @IsOptional()
  @IsNumberString()
  @IsNotEmpty()
  amount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  payment_method?: string | null;
}

export class ProviderPurchaseReportQueryDto {
  @IsIn(REPORT_WINDOWS as unknown as string[])
  @IsNotEmpty()
  window!: ReportWindow;
}

export class ProviderPurchaseResponseDto {
  id!: string;
  provider_name!: string;
  amount!: string;
  payment_method!: string | null;
  created_at!: Date;
  updated_at!: Date;
}

export class PaymentMethodBreakdownDto {
  @IsString()
  method!: string;

  @IsString()
  amount!: string;
}

export class ProviderPurchaseReportResponseDto {
  @IsString()
  window!: string;

  range!: { startsAt: string; endsAt: string };

  @IsString()
  totalAmount!: string;

  @Min(0)
  purchaseCount!: number;

  paymentMethodBreakdown!: PaymentMethodBreakdownDto[];
}
