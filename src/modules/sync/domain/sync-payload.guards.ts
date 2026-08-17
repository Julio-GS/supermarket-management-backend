import {
  SyncAggregateType,
  SyncOperationType,
  SyncPushEntry,
} from '../application/sync.types';
import {
  PaymentMethod,
  ProductCreatePayload,
  ProductDeletePayload,
  ProductUpdatePayload,
  PromotionCreatePayload,
  PromotionDeletePayload,
  PromotionScope,
  PromotionType,
  PromotionUpdatePayload,
  ProviderPurchaseCreatePayload,
  ProviderPurchaseDeletePayload,
  ProviderPurchaseUpdatePayload,
  SaleCreatePayload,
  SaleItemPayload,
  SalePaymentPayload,
  StockAdjustPayload,
  TypedSyncPushEntry,
} from './sync-payloads';

// ---------------------------------------------------------------------------
// Pure Type Checking Helpers (Zero Mutation, Zero Side Effects)
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string =>
  typeof value === 'string';

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const isOptionalNullableString = (
  value: unknown,
): value is string | null | undefined =>
  value === undefined || value === null || typeof value === 'string';

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isOptionalNullableNumber = (
  value: unknown,
): value is number | null | undefined =>
  value === undefined || value === null || isNumber(value);

const isOptionalBoolean = (value: unknown): value is boolean | undefined =>
  value === undefined || typeof value === 'boolean';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isString);

const isOptionalStringArray = (
  value: unknown,
): value is string[] | undefined =>
  value === undefined || isStringArray(value);

const isOptionalNullableNumberArray = (
  value: unknown,
): value is number[] | null | undefined =>
  value === undefined ||
  value === null ||
  (Array.isArray(value) && value.every(isNumber));

const isPaymentMethod = (value: unknown): value is PaymentMethod =>
  value === 'cash' ||
  value === 'transfer' ||
  value === 'card' ||
  value === 'qr';

const isPromotionScope = (value: unknown): value is PromotionScope =>
  value === 'product' || value === 'category' || value === 'global';

const isPromotionType = (value: unknown): value is PromotionType =>
  value === 'percentage' ||
  value === 'fixed_amount' ||
  value === 'buy_x_get_y';

// ---------------------------------------------------------------------------
// 1. Sale Guards
// ---------------------------------------------------------------------------

export function isSaleItemPayload(value: unknown): value is SaleItemPayload {
  if (!isRecord(value)) return false;
  return (
    isOptionalNullableString(value.productId) &&
    isOptionalNullableString(value.name) &&
    isOptionalNullableString(value.description) &&
    isNumber(value.quantity) &&
    isString(value.unitPrice) &&
    isString(value.subtotal) &&
    isOptionalNullableString(value.discountAmount)
  );
}

export function isSalePaymentPayload(
  value: unknown,
): value is SalePaymentPayload {
  if (!isRecord(value)) return false;
  return isPaymentMethod(value.method) && isString(value.amount);
}

export function isSaleCreatePayload(
  value: unknown,
): value is SaleCreatePayload {
  if (!isRecord(value)) return false;
  return (
    isString(value.total) &&
    Array.isArray(value.items) &&
    value.items.every(isSaleItemPayload) &&
    Array.isArray(value.payments) &&
    value.payments.every(isSalePaymentPayload) &&
    isOptionalNullableString(value.saleId) &&
    isOptionalNullableString(value.createdAt)
  );
}

// ---------------------------------------------------------------------------
// 2. Stock Guards
// ---------------------------------------------------------------------------

export function isStockAdjustPayload(
  value: unknown,
): value is StockAdjustPayload {
  if (!isRecord(value)) return false;
  return (
    isString(value.product_id) &&
    isNumber(value.quantity) &&
    isOptionalNullableString(value.reason) &&
    isOptionalNullableString(value.referenceId)
  );
}

// ---------------------------------------------------------------------------
// 3. Product Guards
// ---------------------------------------------------------------------------

export function isProductCreatePayload(
  value: unknown,
): value is ProductCreatePayload {
  if (!isRecord(value)) return false;
  return (
    isString(value.detalle) &&
    isOptionalNullableString(value.costo_neto) &&
    isOptionalNullableString(value.costo_final) &&
    isOptionalNullableString(value.iva) &&
    isOptionalNullableString(value.cambio_costo) &&
    isOptionalNullableString(value.cambio_precio) &&
    isOptionalNullableString(value.etiqueta) &&
    isOptionalBoolean(value.facturable) &&
    isOptionalBoolean(value.maneja_stock) &&
    isOptionalStringArray(value.codigos)
  );
}

export function isProductUpdatePayload(
  value: unknown,
): value is ProductUpdatePayload {
  if (!isRecord(value)) return false;
  return (
    isOptionalString(value.detalle) &&
    isOptionalNullableString(value.costo_neto) &&
    isOptionalNullableString(value.costo_final) &&
    isOptionalNullableString(value.iva) &&
    isOptionalNullableString(value.cambio_costo) &&
    isOptionalNullableString(value.cambio_precio) &&
    isOptionalNullableString(value.etiqueta) &&
    isOptionalBoolean(value.facturable) &&
    isOptionalBoolean(value.maneja_stock) &&
    isOptionalStringArray(value.codigos)
  );
}

export function isProductDeletePayload(
  value: unknown,
): value is ProductDeletePayload {
  return isRecord(value);
}

// ---------------------------------------------------------------------------
// 4. Promotion Guards
// ---------------------------------------------------------------------------

export function isPromotionCreatePayload(
  value: unknown,
): value is PromotionCreatePayload {
  if (!isRecord(value)) return false;
  return (
    isString(value.name) &&
    isOptionalNullableString(value.description) &&
    isPromotionScope(value.scope) &&
    isOptionalNullableString(value.product_id) &&
    isPromotionType(value.type) &&
    isOptionalNullableNumber(value.discount_percent) &&
    isOptionalNullableString(value.start_date) &&
    isOptionalNullableString(value.end_date) &&
    isOptionalNullableNumberArray(value.weekdays)
  );
}

export function isPromotionUpdatePayload(
  value: unknown,
): value is PromotionUpdatePayload {
  if (!isRecord(value)) return false;
  return (
    isOptionalString(value.name) &&
    isOptionalNullableString(value.description) &&
    (value.scope === undefined || isPromotionScope(value.scope)) &&
    isOptionalNullableString(value.product_id) &&
    (value.type === undefined || isPromotionType(value.type)) &&
    isOptionalNullableNumber(value.discount_percent) &&
    isOptionalNullableString(value.start_date) &&
    isOptionalNullableString(value.end_date) &&
    isOptionalNullableNumberArray(value.weekdays) &&
    isOptionalBoolean(value.enabled)
  );
}

export function isPromotionDeletePayload(
  value: unknown,
): value is PromotionDeletePayload {
  return isRecord(value);
}

// ---------------------------------------------------------------------------
// 5. Provider Purchase Guards
// ---------------------------------------------------------------------------

export function isProviderPurchaseCreatePayload(
  value: unknown,
): value is ProviderPurchaseCreatePayload {
  if (!isRecord(value)) return false;
  return (
    isString(value.provider_name) &&
    isString(value.amount) &&
    isOptionalNullableString(value.payment_method)
  );
}

export function isProviderPurchaseUpdatePayload(
  value: unknown,
): value is ProviderPurchaseUpdatePayload {
  if (!isRecord(value)) return false;
  return (
    isOptionalString(value.provider_name) &&
    isOptionalString(value.amount) &&
    isOptionalNullableString(value.payment_method)
  );
}

export function isProviderPurchaseDeletePayload(
  value: unknown,
): value is ProviderPurchaseDeletePayload {
  return isRecord(value);
}

// ---------------------------------------------------------------------------
// Aggregate-Level Guards
// ---------------------------------------------------------------------------

export function isProductPayload(
  operation: SyncOperationType,
  payload: unknown,
): payload is
  | ProductCreatePayload
  | ProductUpdatePayload
  | ProductDeletePayload {
  switch (operation) {
    case 'product_create':
      return isProductCreatePayload(payload);
    case 'product_update':
      return isProductUpdatePayload(payload);
    case 'product_delete':
      return isProductDeletePayload(payload);
    default:
      return false;
  }
}

export function isPromotionPayload(
  operation: SyncOperationType,
  payload: unknown,
): payload is
  | PromotionCreatePayload
  | PromotionUpdatePayload
  | PromotionDeletePayload {
  switch (operation) {
    case 'promotion_create':
      return isPromotionCreatePayload(payload);
    case 'promotion_update':
      return isPromotionUpdatePayload(payload);
    case 'promotion_delete':
      return isPromotionDeletePayload(payload);
    default:
      return false;
  }
}

export function isProviderPurchasePayload(
  operation: SyncOperationType,
  payload: unknown,
): payload is
  | ProviderPurchaseCreatePayload
  | ProviderPurchaseUpdatePayload
  | ProviderPurchaseDeletePayload {
  switch (operation) {
    case 'provider_purchase_create':
      return isProviderPurchaseCreatePayload(payload);
    case 'provider_purchase_update':
      return isProviderPurchaseUpdatePayload(payload);
    case 'provider_purchase_delete':
      return isProviderPurchaseDeletePayload(payload);
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Aggregate-to-Operation Map & Entry Validation
// ---------------------------------------------------------------------------

const EXPECTED_AGGREGATE_BY_OPERATION: Record<
  SyncOperationType,
  SyncAggregateType
> = {
  sale_create: 'sale',
  stock_adjust: 'stock',
  product_create: 'product',
  product_update: 'product',
  product_delete: 'product',
  promotion_create: 'promotion',
  promotion_update: 'promotion',
  promotion_delete: 'promotion',
  provider_purchase_create: 'provider_purchase',
  provider_purchase_update: 'provider_purchase',
  provider_purchase_delete: 'provider_purchase',
};

export type SyncEntryValidationResult =
  | { ok: true; entry: TypedSyncPushEntry }
  | { ok: false; reason: string };

/**
 * Validates aggregate-operation alignment and narrows payload to its
 * corresponding TypeScript type using pure type guards.
 *
 * Guaranteed: Zero mutation, zero object cloning, zero key reordering.
 */
export function validateTypedSyncPushEntry(
  entry: SyncPushEntry,
): SyncEntryValidationResult {
  const expectedAggregate =
    EXPECTED_AGGREGATE_BY_OPERATION[entry.operation_type];

  if (!expectedAggregate) {
    return {
      ok: false,
      reason: `Unsupported operation_type '${entry.operation_type}'.`,
    };
  }

  if (entry.aggregate_type !== expectedAggregate) {
    return {
      ok: false,
      reason: `Operation '${entry.operation_type}' requires aggregate_type '${expectedAggregate}'.`,
    };
  }

  let isPayloadValid = false;

  switch (entry.operation_type) {
    case 'sale_create':
      isPayloadValid = isSaleCreatePayload(entry.payload);
      break;
    case 'stock_adjust':
      isPayloadValid = isStockAdjustPayload(entry.payload);
      break;
    case 'product_create':
      isPayloadValid = isProductCreatePayload(entry.payload);
      break;
    case 'product_update':
      isPayloadValid = isProductUpdatePayload(entry.payload);
      break;
    case 'product_delete':
      isPayloadValid = isProductDeletePayload(entry.payload);
      break;
    case 'promotion_create':
      isPayloadValid = isPromotionCreatePayload(entry.payload);
      break;
    case 'promotion_update':
      isPayloadValid = isPromotionUpdatePayload(entry.payload);
      break;
    case 'promotion_delete':
      isPayloadValid = isPromotionDeletePayload(entry.payload);
      break;
    case 'provider_purchase_create':
      isPayloadValid = isProviderPurchaseCreatePayload(entry.payload);
      break;
    case 'provider_purchase_update':
      isPayloadValid = isProviderPurchaseUpdatePayload(entry.payload);
      break;
    case 'provider_purchase_delete':
      isPayloadValid = isProviderPurchaseDeletePayload(entry.payload);
      break;
  }

  if (!isPayloadValid) {
    return {
      ok: false,
      reason: `Invalid payload for operation '${entry.operation_type}'.`,
    };
  }

  return {
    ok: true,
    entry: entry as TypedSyncPushEntry,
  };
}
