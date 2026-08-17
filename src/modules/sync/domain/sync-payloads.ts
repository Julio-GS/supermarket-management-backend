import {
  SyncAggregateType,
  SyncOperationType,
} from '../application/sync.types';

// ---------------------------------------------------------------------------
// Common Entry Base
// ---------------------------------------------------------------------------

export interface SyncPushEntryBase<
  TAggregate extends SyncAggregateType,
  TOperation extends SyncOperationType,
  TPayload,
> {
  id: string;
  idempotency_key: string;
  operation_type: TOperation;
  aggregate_type: TAggregate;
  aggregate_id: string;
  payload: TPayload;
  base_server_version?: string | null;
  actor_user_id?: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// 1. Sale Payloads
// ---------------------------------------------------------------------------

export type PaymentMethod = 'cash' | 'transfer' | 'card' | 'qr';

export interface SaleItemPayload {
  productId?: string | null;
  name?: string | null;
  description?: string | null;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  discountAmount?: string | null;
}

export interface SalePaymentPayload {
  method: PaymentMethod;
  amount: string;
}

export interface SaleCreatePayload {
  saleId?: string | null;
  total: string;
  items: SaleItemPayload[];
  payments: SalePaymentPayload[];
  createdAt?: string | null;
}

// ---------------------------------------------------------------------------
// 2. Stock Payloads
// ---------------------------------------------------------------------------

export interface StockAdjustPayload {
  product_id: string;
  quantity: number;
  reason?: string | null;
  referenceId?: string | null;
}

// ---------------------------------------------------------------------------
// 3. Product Payloads
// ---------------------------------------------------------------------------

export interface ProductCreatePayload {
  detalle: string;
  costo_neto?: string | null;
  costo_final?: string | null;
  iva?: string | null;
  cambio_costo?: string | null;
  cambio_precio?: string | null;
  etiqueta?: string | null;
  facturable?: boolean;
  maneja_stock?: boolean;
  codigos?: string[];
}

export interface ProductUpdatePayload {
  detalle?: string;
  costo_neto?: string | null;
  costo_final?: string | null;
  iva?: string | null;
  cambio_costo?: string | null;
  cambio_precio?: string | null;
  etiqueta?: string | null;
  facturable?: boolean;
  maneja_stock?: boolean;
  codigos?: string[];
}

export type ProductDeletePayload = Record<string, unknown>;

// ---------------------------------------------------------------------------
// 4. Promotion Payloads
// ---------------------------------------------------------------------------

export type PromotionScope = 'product' | 'category' | 'global';
export type PromotionType = 'percentage' | 'fixed_amount' | 'buy_x_get_y';

export interface PromotionCreatePayload {
  name: string;
  description?: string | null;
  scope: PromotionScope;
  product_id?: string | null;
  type: PromotionType;
  discount_percent?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  weekdays?: number[] | null;
}

export interface PromotionUpdatePayload {
  name?: string;
  description?: string | null;
  scope?: PromotionScope;
  product_id?: string | null;
  type?: PromotionType;
  discount_percent?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  weekdays?: number[] | null;
  enabled?: boolean;
}

export type PromotionDeletePayload = Record<string, unknown>;

// ---------------------------------------------------------------------------
// 5. Provider Purchase Payloads
// ---------------------------------------------------------------------------

export interface ProviderPurchaseCreatePayload {
  provider_name: string;
  amount: string;
  payment_method?: string | null;
}

export interface ProviderPurchaseUpdatePayload {
  provider_name?: string;
  amount?: string;
  payment_method?: string | null;
}

export type ProviderPurchaseDeletePayload = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Discriminated Union Entries for all 11 Operations
// ---------------------------------------------------------------------------

export type SaleCreateEntry = SyncPushEntryBase<
  'sale',
  'sale_create',
  SaleCreatePayload
>;

export type StockAdjustEntry = SyncPushEntryBase<
  'stock',
  'stock_adjust',
  StockAdjustPayload
>;

export type ProductCreateEntry = SyncPushEntryBase<
  'product',
  'product_create',
  ProductCreatePayload
>;

export type ProductUpdateEntry = SyncPushEntryBase<
  'product',
  'product_update',
  ProductUpdatePayload
>;

export type ProductDeleteEntry = SyncPushEntryBase<
  'product',
  'product_delete',
  ProductDeletePayload
>;

export type PromotionCreateEntry = SyncPushEntryBase<
  'promotion',
  'promotion_create',
  PromotionCreatePayload
>;

export type PromotionUpdateEntry = SyncPushEntryBase<
  'promotion',
  'promotion_update',
  PromotionUpdatePayload
>;

export type PromotionDeleteEntry = SyncPushEntryBase<
  'promotion',
  'promotion_delete',
  PromotionDeletePayload
>;

export type ProviderPurchaseCreateEntry = SyncPushEntryBase<
  'provider_purchase',
  'provider_purchase_create',
  ProviderPurchaseCreatePayload
>;

export type ProviderPurchaseUpdateEntry = SyncPushEntryBase<
  'provider_purchase',
  'provider_purchase_update',
  ProviderPurchaseUpdatePayload
>;

export type ProviderPurchaseDeleteEntry = SyncPushEntryBase<
  'provider_purchase',
  'provider_purchase_delete',
  ProviderPurchaseDeletePayload
>;

export type TypedSyncPushEntry =
  | SaleCreateEntry
  | StockAdjustEntry
  | ProductCreateEntry
  | ProductUpdateEntry
  | ProductDeleteEntry
  | PromotionCreateEntry
  | PromotionUpdateEntry
  | PromotionDeleteEntry
  | ProviderPurchaseCreateEntry
  | ProviderPurchaseUpdateEntry
  | ProviderPurchaseDeleteEntry;

// ---------------------------------------------------------------------------
// Utility Types
// ---------------------------------------------------------------------------

export type EntryForOperation<TOperation extends SyncOperationType> = Extract<
  TypedSyncPushEntry,
  { operation_type: TOperation }
>;

export type PayloadForOperation<TOperation extends SyncOperationType> =
  EntryForOperation<TOperation>['payload'];
