import { Injectable } from "@nestjs/common";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { PromotionRepositoryPort } from "../../promotions/application/promotion.repository.port";
import { ProviderPurchaseRepositoryPort } from "../../reports/application/provider-purchase.repository.port";
import { UserRepositoryPort } from "../../users/application/user.repository.port";
import type {
  BootstrapSnapshotDto,
  BootstrapProductDto,
  BootstrapStockBalanceDto,
  BootstrapPromotionDto,
  BootstrapProviderPurchaseDto,
  BootstrapUserProfileDto,
} from "../presentation/bootstrap.dto";

@Injectable()
export class BootstrapUseCase {
  constructor(
    private readonly productRepo: ProductRepositoryPort,
    private readonly inventoryRepo: InventoryRepositoryPort,
    private readonly promotionRepo: PromotionRepositoryPort,
    private readonly providerPurchaseRepo: ProviderPurchaseRepositoryPort,
    private readonly userRepo: UserRepositoryPort,
  ) {}

  async execute(userId: string): Promise<BootstrapSnapshotDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const [products, stockBalances, promotions, providerPurchases] =
      await Promise.all([
        this.productRepo.findAll(),
        this.inventoryRepo.findAllBalances(),
        this.promotionRepo.findAll(),
        this.providerPurchaseRepo.findAll(),
      ]);

    return {
      products: products.map(toProductDto),
      stock_balances: stockBalances.map(toStockBalanceDto),
      promotions: promotions.map(toPromotionDto),
      provider_purchases: providerPurchases.map(toProviderPurchaseDto),
      user_profile: toUserProfileDto(user),
      sync_cursor: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Internal mappers — keep domain entities isolated from the wire shape
// ---------------------------------------------------------------------------

function toProductDto(p: {
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
  created_at: Date;
  updated_at: Date;
}): BootstrapProductDto {
  return {
    id: p.id,
    detalle: p.detalle,
    costo_neto: p.costo_neto,
    costo_final: p.costo_final,
    iva: p.iva,
    cambio_costo: p.cambio_costo,
    cambio_precio: p.cambio_precio,
    etiqueta: p.etiqueta,
    facturable: p.facturable,
    maneja_stock: p.maneja_stock,
    codigos: p.codigos,
    pricing_mode: p.pricing_mode,
    is_protected: p.is_protected,
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  };
}

function toStockBalanceDto(b: {
  product_id: string;
  stock_actual: number;
  updated_at: Date;
}): BootstrapStockBalanceDto {
  return {
    product_id: b.product_id,
    stock_actual: b.stock_actual,
    updated_at: b.updated_at.toISOString(),
  };
}

function toPromotionDto(p: {
  id: string;
  name: string;
  description?: string | null;
  scope: string;
  product_id?: string | null;
  type: string;
  discount_percent?: number | null;
  start_date?: Date | null;
  end_date?: Date | null;
  weekdays?: number[] | null;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}): BootstrapPromotionDto {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    scope: p.scope,
    product_id: p.product_id ?? null,
    type: p.type,
    discount_percent: p.discount_percent ?? null,
    start_date: p.start_date?.toISOString() ?? null,
    end_date: p.end_date?.toISOString() ?? null,
    weekdays: p.weekdays ?? null,
    enabled: p.enabled,
    created_at: p.created_at.toISOString(),
    updated_at: p.updated_at.toISOString(),
  };
}

function toProviderPurchaseDto(pp: {
  id: string;
  provider_name: string;
  amount: string;
  payment_method: string | null;
  created_at: Date;
  updated_at: Date;
}): BootstrapProviderPurchaseDto {
  return {
    id: pp.id,
    provider_name: pp.provider_name,
    amount: pp.amount,
    payment_method: pp.payment_method,
    created_at: pp.created_at.toISOString(),
    updated_at: pp.updated_at.toISOString(),
  };
}

function toUserProfileDto(u: {
  id: string;
  username: string;
  created_at: Date;
  updated_at: Date;
}): BootstrapUserProfileDto {
  return {
    id: u.id,
    username: u.username,
    created_at: u.created_at.toISOString(),
    updated_at: u.updated_at.toISOString(),
  };
}
