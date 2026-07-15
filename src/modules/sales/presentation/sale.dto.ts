import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from "class-validator";
import { PAYMENT_METHODS, PaymentMethod } from "../domain/sale.entity";
import { validateMoneyString } from "../../../shared/money/money.helper";

@ValidatorConstraint({ name: "moneyStringOrEmpty", async: false })
class MoneyStringOrEmptyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    return typeof value === "string" && validateMoneyString(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid money string like "2500.50" or omitted`;
  }
}

@ValidatorConstraint({ name: "saleItemSource", async: false })
class SaleItemSourceConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const obj = args.object as Record<string, unknown>;
    const hasProductId = obj.product_id !== undefined && obj.product_id !== null && obj.product_id !== "";
    const hasName = obj.name !== undefined && obj.name !== null && obj.name !== "";
    const hasUnitPrice = obj.unit_price !== undefined && obj.unit_price !== null && obj.unit_price !== "";

    // Must be either catalog (product_id) OR ad-hoc (name + unit_price), not both, not neither
    if (hasProductId && !hasName && !hasUnitPrice) {
      return true; // catalog item
    }
    if (!hasProductId && hasName && hasUnitPrice) {
      return true; // ad-hoc item
    }
    return false;
  }

  defaultMessage(): string {
    return "Each sale item must be either catalog-backed (product_id) or ad-hoc (name + unit_price), never both";
  }
}

export class PaymentMethodAllocationDto {
  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethod;

  @IsString()
  @IsNotEmpty()
  amount!: string;
}

export class SaleItemSplitTicketDto {
  @IsInt()
  @Min(0)
  @Type(() => Number)
  group_1_quantity!: number;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  group_2_quantity!: number;
}

export class SaleItemDto {
  @IsOptional()
  @IsUUID()
  product_id?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Validate(MoneyStringOrEmptyConstraint)
  unit_price?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsOptional()
  @Validate(MoneyStringOrEmptyConstraint)
  line_total?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SaleItemSplitTicketDto)
  split_ticket?: SaleItemSplitTicketDto;

  @Validate(SaleItemSourceConstraint)
  _source!: string;
}

export class SplitTicketGroupItemDto {
  @IsUUID()
  product_id!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;
}

export class SplitTicketGroupDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ValidateNested({ each: true })
  @Type(() => SplitTicketGroupItemDto)
  @ArrayMinSize(1)
  items!: SplitTicketGroupItemDto[];
}

export class CreateSaleDto {
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  @ArrayMinSize(1)
  items!: SaleItemDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SplitTicketGroupDto)
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @ArrayUnique((group: SplitTicketGroupDto) => group.label)
  split_ticket_groups?: SplitTicketGroupDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PaymentMethodAllocationDto)
  payment_methods!: PaymentMethodAllocationDto[];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  invoice_requested?: boolean;
}

export class SaleItemResponseDto {
  id!: string;
  product_id!: string | null;
  name?: string | null;
  description?: string | null;
  iva?: string | null;
  quantity!: number;
  unit_price!: string;
  subtotal!: string;
  discount_amount!: string;
  applied_promotions!: {
    promotion_id: string;
    promotion_scope: "product" | "store";
    promotion_type: "percentage" | "two_x_one";
    discount_amount: string;
  }[];
  applied_promotion_id?: string | null;
  applied_promotion_type?: string | null;
}

export class SaleSplitTicketGroupItemResponseDto {
  product_id!: string;
  quantity!: number;
  unit_price!: string;
  subtotal!: string;
}

export class SaleSplitTicketGroupResponseDto {
  label!: string;
  items!: SaleSplitTicketGroupItemResponseDto[];
}

export class SaleResponseDto {
  id!: string;
  user_id!: string;
  total!: string;
  payment_methods!: PaymentMethodAllocationDto[];
  split_ticket_groups!: SaleSplitTicketGroupResponseDto[] | null;
  items!: SaleItemResponseDto[];
  invoice_status!: string;
  cae!: string | null;
  cae_vto!: string | null;
  cbte_nro!: number | null;
  cbte_tipo!: number | null;
  pto_vta!: number | null;
  invoice_requested_at!: Date | null;
  created_at!: Date;
  updated_at!: Date;
}
