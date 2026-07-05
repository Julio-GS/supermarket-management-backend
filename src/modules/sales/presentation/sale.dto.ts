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
  ValidateNested,
} from "class-validator";
import { PAYMENT_METHODS, PaymentMethod } from "../domain/sale.entity";

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
  @IsUUID()
  product_id!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => SaleItemSplitTicketDto)
  split_ticket?: SaleItemSplitTicketDto;
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
  @ArrayUnique()
  @IsIn(PAYMENT_METHODS, { each: true })
  payment_methods!: PaymentMethod[];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  invoice_requested?: boolean;
}

export class SaleItemResponseDto {
  id!: string;
  product_id!: string;
  quantity!: number;
  unit_price!: string;
  subtotal!: string;
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
  payment_methods!: PaymentMethod[];
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
