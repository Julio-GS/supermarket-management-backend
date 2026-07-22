import { IsString, IsNotEmpty } from "class-validator";

// ---------------------------------------------------------------------------
// Request DTOs
// ---------------------------------------------------------------------------

export class BootstrapRequestDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}

// ---------------------------------------------------------------------------
// Response DTOs — mirrors the bootstrap snapshot contract
// ---------------------------------------------------------------------------

export interface BootstrapProductDto {
  id: string;
  detalle: string;
  costo_neto: string | null;
  costo_final: string | null;
  iva: string | null;
  cambio_costo: string;
  cambio_precio: string;
  etiqueta: string;
  facturable: boolean;
  maneja_stock: boolean;
  codigos: string[];
  pricing_mode: string;
  is_protected: boolean;
  created_at: string;
  updated_at: string;
}

export interface BootstrapStockBalanceDto {
  product_id: string;
  stock_actual: number;
  updated_at: string;
}

export interface BootstrapPromotionDto {
  id: string;
  name: string;
  description: string | null;
  scope: string;
  product_id: string | null;
  type: string;
  discount_percent: number | null;
  start_date: string | null;
  end_date: string | null;
  weekdays: number[] | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface BootstrapProviderPurchaseDto {
  id: string;
  provider_name: string;
  amount: string;
  payment_method: string | null;
  created_at: string;
  updated_at: string;
}

export interface BootstrapUserProfileDto {
  id: string;
  username: string;
  created_at: string;
  updated_at: string;
}

export interface BootstrapSnapshotDto {
  products: BootstrapProductDto[];
  stock_balances: BootstrapStockBalanceDto[];
  promotions: BootstrapPromotionDto[];
  provider_purchases: BootstrapProviderPurchaseDto[];
  user_profile: BootstrapUserProfileDto;
  sync_cursor: string;
}
