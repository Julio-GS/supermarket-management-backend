import { Type } from "class-transformer";
import {
  IsNotEmpty,
  IsUUID,
  IsIn,
  IsInt,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsArray,
  ArrayUnique,
  Min,
  Max,
  ArrayMinSize,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
  IsString,
} from "class-validator";
import {
  PROMOTION_TYPES,
  PROMOTION_SCOPES,
  PromotionScope,
  PromotionType,
} from "../domain/promotion.entity";

@ValidatorConstraint({ name: "scheduleComplete", async: false })
class ScheduleCompleteConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const obj = args.object as Record<string, unknown>;
    const hasDateRange =
      obj.start_date !== undefined &&
      obj.start_date !== null &&
      obj.start_date !== "" &&
      obj.end_date !== undefined &&
      obj.end_date !== null &&
      obj.end_date !== "";
    const hasWeekdays =
      Array.isArray(obj.weekdays) && (obj.weekdays as unknown[]).length > 0;

    if (!hasDateRange && !hasWeekdays) return false;

    if (hasDateRange) {
      const start = obj.start_date as string;
      const end = obj.end_date as string;
      if (start > end) return false;
    }

    return true;
  }

  defaultMessage(): string {
    return "Either a date range (start_date + end_date with start <= end) or weekdays (1-7) must be provided";
  }
}

@ValidatorConstraint({ name: "percentMatchesType", async: false })
class PercentMatchesTypeConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const obj = args.object as Record<string, unknown>;
    const type = obj.type as string;
    const dp = obj.discount_percent;

    if (type === "percentage") {
      return (
        dp !== undefined &&
        dp !== null &&
        typeof dp === "number" &&
        dp >= 1 &&
        dp <= 99
      );
    }

    if (type === "two_x_one") {
      return dp === undefined || dp === null;
    }

    return true;
  }

  defaultMessage(): string {
    return "percentage type requires discount_percent (1-99); two_x_one must NOT have discount_percent";
  }
}

@ValidatorConstraint({ name: "targetComplete", async: false })
class TargetCompleteConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const obj = args.object as Record<string, unknown>;
    const scope = obj.scope as PromotionScope | undefined;
    const productId = obj.product_id as string | null | undefined;
    const hasProductId = typeof productId === "string" && productId.length > 0;

    if (scope === "store") {
      return !hasProductId;
    }

    if (scope === "product") {
      return hasProductId;
    }

    return hasProductId;
  }

  defaultMessage(): string {
    return "product_id is required for product promotions and must be omitted for store-wide promotions";
  }
}

export class CreatePromotionDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn(PROMOTION_SCOPES)
  scope?: PromotionScope;

  @IsOptional()
  @IsUUID()
  product_id?: string | null;

  @IsIn(PROMOTION_TYPES)
  type!: PromotionType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  @Type(() => Number)
  discount_percent?: number | null;

  @IsOptional()
  @IsDateString()
  start_date?: string | null;

  @IsOptional()
  @IsDateString()
  end_date?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  @ArrayMinSize(1)
  @Type(() => Number)
  weekdays?: number[] | null;

  @Validate(ScheduleCompleteConstraint)
  @Validate(PercentMatchesTypeConstraint)
  @Validate(TargetCompleteConstraint)
  _validation!: string;
}

export class UpdatePromotionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsIn(PROMOTION_SCOPES)
  scope?: PromotionScope;

  @IsOptional()
  @IsUUID()
  product_id?: string | null;

  @IsOptional()
  @IsIn(PROMOTION_TYPES)
  type?: PromotionType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  @Type(() => Number)
  discount_percent?: number | null;

  @IsOptional()
  @IsDateString()
  start_date?: string | null;

  @IsOptional()
  @IsDateString()
  end_date?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  @ArrayMinSize(1)
  @Type(() => Number)
  weekdays?: number[] | null;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  enabled?: boolean;
}

export class PromotionResponseDto {
  id!: string;
  name!: string;
  description?: string | null;
  scope!: PromotionScope;
  product_id!: string | null;
  type!: string;
  discount_percent?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  weekdays?: number[] | null;
  enabled!: boolean;
  created_at!: Date;
  updated_at!: Date;
}
