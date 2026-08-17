import { IsString, IsOptional, IsUUID, IsInt, Min, Max, MinLength, MaxLength, Validate, ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from "class-validator";
import { validateMoneyString } from "../../../shared/money/money.helper";

@ValidatorConstraint({ name: "moneyString", async: false })
class MoneyStringConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === "string" && validateMoneyString(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid money string like "1250.50"`;
  }
}

export class CreatePrintJobDto {
  @IsUUID()
  product_id!: string;

  @IsString()
  @MinLength(1)
  sku!: string;

  @IsString()
  @MinLength(1)
  product_name!: string;

  @Validate(MoneyStringConstraint)
  sale_price!: string;

  @IsOptional()
  @IsString()
  idempotency_key?: string;
}

export class ClaimJobDto {
  @IsString()
  @MinLength(1)
  installation!: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(300000)
  lease_ms?: number;
}

export class CompleteJobDto {
  @IsString()
  @MinLength(1)
  installation!: string;
}

export class ClaimBatchDto {
  @IsString()
  @MinLength(1)
  installation!: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(300000)
  lease_ms?: number;

  @IsInt()
  @Min(1)
  @Max(45)
  limit!: number;
}

export class FailJobDto {
  @IsString()
  @MinLength(1)
  installation!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}

export class BlockJobDto {
  @IsString()
  @MinLength(1)
  installation!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class PrintJobResponseDto {
  id!: string;
  product_id!: string;
  sku!: string;
  product_name!: string;
  sale_price!: string;
  status!: string;
  claimed_by!: string | null;
  claimed_at!: string | null;
  lease_expires_at!: string | null;
  completed_at!: string | null;
  failed_at!: string | null;
  fail_reason!: string | null;
  blocked_reason!: string | null;
  blocked_by!: string | null;
  blocked_at!: string | null;
  created_at!: string;
  updated_at!: string;
}

export class ClaimBatchContinueDto {
  @IsString()
  @MinLength(1)
  installation!: string;

  @IsOptional()
  @IsString()
  cursor?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(45)
  limit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(300)
  lease_seconds?: number;
}

export class ClaimBatchContinueResponseDto {
  jobs!: PrintJobResponseDto[];
  next_cursor!: string | null;
  has_more!: boolean;
}
