import {
  IsString,
  IsBoolean,
  IsOptional,
  MinLength,
  ArrayMinSize,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from "class-validator";
import { validateMoneyString } from "../../../shared/money/money.helper";
import { PaginationQueryDto } from "../../../shared/read-model/pagination.dto";

@ValidatorConstraint({ name: "moneyString", async: false })
class MoneyStringConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === "string" && validateMoneyString(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid money string like "2500.50"`;
  }
}

export class CreateProductDto {
  @IsString()
  @MinLength(1)
  detalle!: string;

  @Validate(MoneyStringConstraint)
  costo_neto!: string;

  @Validate(MoneyStringConstraint)
  costo_final!: string;

  @Validate(MoneyStringConstraint)
  iva!: string;

  @IsString()
  cambio_costo!: string;

  @IsString()
  cambio_precio!: string;

  @IsString()
  etiqueta!: string;

  @IsBoolean()
  facturable!: boolean;

  @IsBoolean()
  maneja_stock!: boolean;

  @IsString({ each: true })
  @ArrayMinSize(1)
  codigos!: string[];
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  detalle?: string;

  @IsOptional()
  @Validate(MoneyStringConstraint)
  costo_neto?: string;

  @IsOptional()
  @Validate(MoneyStringConstraint)
  costo_final?: string;

  @IsOptional()
  @Validate(MoneyStringConstraint)
  iva?: string;

  @IsOptional()
  @IsString()
  cambio_costo?: string;

  @IsOptional()
  @IsString()
  cambio_precio?: string;

  @IsOptional()
  @IsString()
  etiqueta?: string;

  @IsOptional()
  @IsBoolean()
  facturable?: boolean;

  @IsOptional()
  @IsBoolean()
  maneja_stock?: boolean;

  @IsOptional()
  @IsString({ each: true })
  codigos?: string[];
}

export class ProductPromotionSummaryDto {
  id!: string;
  name!: string;
  description?: string | null;
  scope!: string;
  type!: string;
  discount_percent?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  weekdays?: number[] | null;
}

export class ProductResponseDto {
  id!: string;
  detalle!: string;
  costo_neto!: string;
  costo_final!: string;
  iva!: string;
  cambio_costo!: string;
  cambio_precio!: string;
  etiqueta!: string;
  facturable!: boolean;
  maneja_stock!: boolean;
  codigos!: string[];
  promotions?: ProductPromotionSummaryDto[] | null;
  store_promotions?: ProductPromotionSummaryDto[] | null;
  created_at!: Date;
  updated_at!: Date;
}

export class ProductListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}
