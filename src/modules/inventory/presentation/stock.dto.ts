import { IsInt, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class AdjustStockDto {
  @IsUUID()
  product_id!: string;

  @IsInt()
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
