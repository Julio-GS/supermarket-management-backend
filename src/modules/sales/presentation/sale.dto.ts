import { Type } from "class-transformer";
import {
  IsUUID,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
  ValidateNested,
  ArrayMinSize,
} from "class-validator";

export class SaleItemDto {
  @IsUUID()
  product_id!: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;
}

export class CreateSaleDto {
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  @ArrayMinSize(1)
  items!: SaleItemDto[];

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

export class SaleResponseDto {
  id!: string;
  user_id!: string;
  total!: string;
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
