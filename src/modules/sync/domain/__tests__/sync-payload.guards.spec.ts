import {
  isSaleItemPayload,
  isSalePaymentPayload,
  isSaleCreatePayload,
  isStockAdjustPayload,
  isProductCreatePayload,
  isProductUpdatePayload,
  isProductDeletePayload,
  isPromotionCreatePayload,
  isPromotionUpdatePayload,
  isPromotionDeletePayload,
  isProviderPurchaseCreatePayload,
  isProviderPurchaseUpdatePayload,
  isProviderPurchaseDeletePayload,
  isProductPayload,
  isPromotionPayload,
  isProviderPurchasePayload,
  validateTypedSyncPushEntry,
} from '../sync-payload.guards';
import { SyncOperationType, SyncPushEntry } from '../../application/sync.types';

describe('Sync Payload Guards & Typed Validation', () => {
  describe('Sale payload guards', () => {
    describe('isSaleItemPayload', () => {
      it('accepts minimal valid sale item', () => {
        const item = {
          quantity: 2,
          unitPrice: '50.00',
          subtotal: '100.00',
        };
        expect(isSaleItemPayload(item)).toBe(true);
      });

      it('accepts full valid sale item with all optional fields', () => {
        const item = {
          productId: 'prod-1',
          name: 'Item Name',
          description: 'Description',
          quantity: 3,
          unitPrice: '10.00',
          subtotal: '30.00',
          discountAmount: '0.00',
        };
        expect(isSaleItemPayload(item)).toBe(true);
      });

      it('accepts null for optional fields', () => {
        const item = {
          productId: null,
          name: null,
          description: null,
          quantity: 1,
          unitPrice: '10.00',
          subtotal: '10.00',
          discountAmount: null,
        };
        expect(isSaleItemPayload(item)).toBe(true);
      });

      it('rejects non-object values', () => {
        expect(isSaleItemPayload(null)).toBe(false);
        expect(isSaleItemPayload(undefined)).toBe(false);
        expect(isSaleItemPayload('string')).toBe(false);
        expect(isSaleItemPayload(123)).toBe(false);
        expect(isSaleItemPayload([])).toBe(false);
      });

      it('rejects missing or invalid required fields', () => {
        expect(isSaleItemPayload({ unitPrice: '10.00', subtotal: '10.00' })).toBe(false); // missing quantity
        expect(isSaleItemPayload({ quantity: 'one', unitPrice: '10.00', subtotal: '10.00' })).toBe(false); // non-number quantity
        expect(isSaleItemPayload({ quantity: NaN, unitPrice: '10.00', subtotal: '10.00' })).toBe(false); // NaN quantity
        expect(isSaleItemPayload({ quantity: Infinity, unitPrice: '10.00', subtotal: '10.00' })).toBe(false); // Infinity quantity
        expect(isSaleItemPayload({ quantity: 1, unitPrice: 10, subtotal: '10.00' })).toBe(false); // non-string unitPrice
        expect(isSaleItemPayload({ quantity: 1, unitPrice: '10.00', subtotal: 10 })).toBe(false); // non-string subtotal
        expect(isSaleItemPayload({ quantity: 1, unitPrice: '10.00', subtotal: '10.00', discountAmount: 5 })).toBe(false); // invalid discountAmount
      });
    });

    describe('isSalePaymentPayload', () => {
      it('accepts valid payment methods', () => {
        expect(isSalePaymentPayload({ method: 'cash', amount: '100.00' })).toBe(true);
        expect(isSalePaymentPayload({ method: 'transfer', amount: '100.00' })).toBe(true);
        expect(isSalePaymentPayload({ method: 'card', amount: '100.00' })).toBe(true);
        expect(isSalePaymentPayload({ method: 'qr', amount: '100.00' })).toBe(true);
      });

      it('rejects invalid payment method or non-string amount', () => {
        expect(isSalePaymentPayload({ method: 'bitcoin', amount: '100.00' })).toBe(false);
        expect(isSalePaymentPayload({ method: 'cash', amount: 100 })).toBe(false);
        expect(isSalePaymentPayload(null)).toBe(false);
        expect(isSalePaymentPayload({})).toBe(false);
      });
    });

    describe('isSaleCreatePayload', () => {
      it('accepts valid sale_create payload with optional fields', () => {
        const payload = {
          saleId: 'sale-001',
          total: '250.00',
          items: [
            { quantity: 1, unitPrice: '150.00', subtotal: '150.00' },
            { quantity: 1, unitPrice: '100.00', subtotal: '100.00' },
          ],
          payments: [
            { method: 'cash', amount: '150.00' },
            { method: 'card', amount: '100.00' },
          ],
          createdAt: '2026-08-17T12:00:00.000Z',
        };
        expect(isSaleCreatePayload(payload)).toBe(true);
      });

      it('rejects sale_create with invalid items or payments array', () => {
        expect(isSaleCreatePayload({
          total: '100.00',
          items: 'not-an-array',
          payments: [{ method: 'cash', amount: '100.00' }],
        })).toBe(false);

        expect(isSaleCreatePayload({
          total: '100.00',
          items: [{ invalid: 'item' }],
          payments: [{ method: 'cash', amount: '100.00' }],
        })).toBe(false);

        expect(isSaleCreatePayload({
          total: '100.00',
          items: [{ quantity: 1, unitPrice: '100.00', subtotal: '100.00' }],
          payments: 'not-an-array',
        })).toBe(false);

        expect(isSaleCreatePayload({
          total: '100.00',
          items: [{ quantity: 1, unitPrice: '100.00', subtotal: '100.00' }],
          payments: [{ method: 'unsupported', amount: '100.00' }],
        })).toBe(false);
      });
    });
  });

  describe('Stock payload guards', () => {
    describe('isStockAdjustPayload', () => {
      it('accepts valid stock adjust payload with all fields', () => {
        const payload = {
          product_id: 'prod-456',
          quantity: -5,
          reason: 'damage',
          referenceId: 'ref-789',
        };
        expect(isStockAdjustPayload(payload)).toBe(true);
      });

      it('accepts minimal stock adjust payload with nulls', () => {
        const payload = {
          product_id: 'prod-456',
          quantity: 10,
          reason: null,
          referenceId: null,
        };
        expect(isStockAdjustPayload(payload)).toBe(true);
      });

      it('rejects non-finite quantity (NaN, Infinity)', () => {
        expect(isStockAdjustPayload({ product_id: 'p1', quantity: NaN })).toBe(false);
        expect(isStockAdjustPayload({ product_id: 'p1', quantity: Infinity })).toBe(false);
        expect(isStockAdjustPayload({ product_id: 'p1', quantity: -Infinity })).toBe(false);
      });

      it('rejects missing product_id or invalid field types', () => {
        expect(isStockAdjustPayload({ quantity: 5 })).toBe(false);
        expect(isStockAdjustPayload({ product_id: 123, quantity: 5 })).toBe(false);
        expect(isStockAdjustPayload({ product_id: 'p1', quantity: 5, reason: 123 })).toBe(false);
        expect(isStockAdjustPayload({ product_id: 'p1', quantity: 5, referenceId: true })).toBe(false);
      });
    });
  });

  describe('Product payload guards', () => {
    describe('isProductCreatePayload', () => {
      it('accepts full product_create payload', () => {
        const payload = {
          detalle: 'Coca Cola 1.5L',
          costo_neto: '100.00',
          costo_final: '121.00',
          iva: '21.00',
          cambio_costo: '0.00',
          cambio_precio: '0.00',
          etiqueta: 'Bebidas',
          facturable: true,
          maneja_stock: true,
          codigos: ['7791234567890', 'BEB-01'],
        };
        expect(isProductCreatePayload(payload)).toBe(true);
      });

      it('accepts minimal product_create with only detalle', () => {
        expect(isProductCreatePayload({ detalle: 'Simple Product' })).toBe(true);
      });

      it('rejects missing or non-string detalle', () => {
        expect(isProductCreatePayload({})).toBe(false);
        expect(isProductCreatePayload({ detalle: null })).toBe(false);
        expect(isProductCreatePayload({ detalle: 123 })).toBe(false);
      });

      it('rejects invalid types for optional product fields', () => {
        expect(isProductCreatePayload({ detalle: 'P', facturable: 'yes' })).toBe(false);
        expect(isProductCreatePayload({ detalle: 'P', maneja_stock: 1 })).toBe(false);
        expect(isProductCreatePayload({ detalle: 'P', codigos: [123] })).toBe(false);
        expect(isProductCreatePayload({ detalle: 'P', codigos: '779123' })).toBe(false);
        expect(isProductCreatePayload({ detalle: 'P', costo_final: 121 })).toBe(false);
      });
    });

    describe('isProductUpdatePayload', () => {
      it('accepts partial update payload', () => {
        expect(isProductUpdatePayload({ detalle: 'Updated Name' })).toBe(true);
        expect(isProductUpdatePayload({ costo_final: '150.00' })).toBe(true);
        expect(isProductUpdatePayload({ facturable: false })).toBe(true);
        expect(isProductUpdatePayload({})).toBe(true);
      });

      it('rejects invalid types on update fields', () => {
        expect(isProductUpdatePayload({ detalle: 123 })).toBe(false);
        expect(isProductUpdatePayload({ costo_neto: 100 })).toBe(false);
        expect(isProductUpdatePayload({ codigos: 'single-string' })).toBe(false);
        expect(isProductUpdatePayload(null)).toBe(false);
      });
    });

    describe('isProductDeletePayload', () => {
      it('accepts empty object or object with extra properties', () => {
        expect(isProductDeletePayload({})).toBe(true);
        expect(isProductDeletePayload({ client_reason: 'discontinued' })).toBe(true);
      });

      it('rejects primitive values', () => {
        expect(isProductDeletePayload(null)).toBe(false);
        expect(isProductDeletePayload(undefined)).toBe(false);
        expect(isProductDeletePayload('delete')).toBe(false);
        expect(isProductDeletePayload(123)).toBe(false);
      });
    });
  });

  describe('Promotion payload guards', () => {
    describe('isPromotionCreatePayload', () => {
      it('accepts valid promotion_create payload', () => {
        const payload = {
          name: '2x1 Promo',
          description: 'Special weekend promo',
          scope: 'product',
          product_id: 'prod-001',
          type: 'percentage',
          discount_percent: 50,
          start_date: '2026-08-01',
          end_date: '2026-08-31',
          weekdays: [0, 6],
        };
        expect(isPromotionCreatePayload(payload)).toBe(true);
      });

      it('accepts minimal promotion_create with allowed literals', () => {
        expect(isPromotionCreatePayload({
          name: 'Global 10%',
          scope: 'global',
          type: 'percentage',
        })).toBe(true);

        expect(isPromotionCreatePayload({
          name: 'Category Fixed',
          scope: 'category',
          type: 'fixed_amount',
        })).toBe(true);

        expect(isPromotionCreatePayload({
          name: 'Product Combo',
          scope: 'product',
          type: 'buy_x_get_y',
        })).toBe(true);
      });

      it('rejects invalid scope or type', () => {
        expect(isPromotionCreatePayload({
          name: 'Promo',
          scope: 'invalid_scope',
          type: 'percentage',
        })).toBe(false);

        expect(isPromotionCreatePayload({
          name: 'Promo',
          scope: 'global',
          type: 'invalid_type',
        })).toBe(false);
      });

      it('rejects non-numeric discount_percent or weekdays', () => {
        expect(isPromotionCreatePayload({
          name: 'Promo',
          scope: 'global',
          type: 'percentage',
          discount_percent: '10%',
        })).toBe(false);

        expect(isPromotionCreatePayload({
          name: 'Promo',
          scope: 'global',
          type: 'percentage',
          weekdays: ['Mon', 'Tue'],
        })).toBe(false);
      });
    });

    describe('isPromotionUpdatePayload', () => {
      it('accepts partial update payload', () => {
        expect(isPromotionUpdatePayload({ name: 'Renamed Promo' })).toBe(true);
        expect(isPromotionUpdatePayload({ enabled: false })).toBe(true);
        expect(isPromotionUpdatePayload({ discount_percent: 20 })).toBe(true);
        expect(isPromotionUpdatePayload({})).toBe(true);
      });

      it('rejects invalid scope, type, or types on update', () => {
        expect(isPromotionUpdatePayload({ scope: 'unknown' as any })).toBe(false);
        expect(isPromotionUpdatePayload({ type: 'unknown' as any })).toBe(false);
        expect(isPromotionUpdatePayload({ enabled: 'true' })).toBe(false);
      });
    });

    describe('isPromotionDeletePayload', () => {
      it('accepts objects and rejects primitives', () => {
        expect(isPromotionDeletePayload({})).toBe(true);
        expect(isPromotionDeletePayload(null)).toBe(false);
        expect(isPromotionDeletePayload(123)).toBe(false);
      });
    });
  });

  describe('Provider purchase payload guards', () => {
    describe('isProviderPurchaseCreatePayload', () => {
      it('accepts valid provider_purchase_create payload', () => {
        const payload = {
          provider_name: 'Distribuidora Central',
          amount: '12500.50',
          payment_method: 'transfer',
        };
        expect(isProviderPurchaseCreatePayload(payload)).toBe(true);
      });

      it('rejects missing provider_name or amount', () => {
        expect(isProviderPurchaseCreatePayload({ provider_name: 'P1' })).toBe(false);
        expect(isProviderPurchaseCreatePayload({ amount: '100.00' })).toBe(false);
        expect(isProviderPurchaseCreatePayload({ provider_name: 123, amount: '100.00' })).toBe(false);
        expect(isProviderPurchaseCreatePayload({ provider_name: 'P1', amount: 100 })).toBe(false);
      });
    });

    describe('isProviderPurchaseUpdatePayload', () => {
      it('accepts partial provider purchase update', () => {
        expect(isProviderPurchaseUpdatePayload({ provider_name: 'Updated P1' })).toBe(true);
        expect(isProviderPurchaseUpdatePayload({ amount: '1500.00' })).toBe(true);
        expect(isProviderPurchaseUpdatePayload({ payment_method: 'cash' })).toBe(true);
        expect(isProviderPurchaseUpdatePayload({})).toBe(true);
      });

      it('rejects invalid types on update fields', () => {
        expect(isProviderPurchaseUpdatePayload({ amount: 1500 })).toBe(false);
        expect(isProviderPurchaseUpdatePayload({ provider_name: null })).toBe(false);
      });
    });

    describe('isProviderPurchaseDeletePayload', () => {
      it('accepts objects and rejects primitives', () => {
        expect(isProviderPurchaseDeletePayload({})).toBe(true);
        expect(isProviderPurchaseDeletePayload(null)).toBe(false);
      });
    });
  });

  describe('Aggregate-level guards', () => {
    it('isProductPayload handles all product operations and rejects non-product operations', () => {
      expect(isProductPayload('product_create', { detalle: 'Prod' })).toBe(true);
      expect(isProductPayload('product_update', { detalle: 'Prod' })).toBe(true);
      expect(isProductPayload('product_delete', {})).toBe(true);
      expect(isProductPayload('sale_create' as SyncOperationType, { detalle: 'Prod' })).toBe(false);
    });

    it('isPromotionPayload handles all promotion operations and rejects non-promotion operations', () => {
      expect(isPromotionPayload('promotion_create', { name: 'P', scope: 'global', type: 'percentage' })).toBe(true);
      expect(isPromotionPayload('promotion_update', { name: 'P' })).toBe(true);
      expect(isPromotionPayload('promotion_delete', {})).toBe(true);
      expect(isPromotionPayload('product_create' as SyncOperationType, {})).toBe(false);
    });

    it('isProviderPurchasePayload handles all provider purchase operations and rejects non-purchase operations', () => {
      expect(isProviderPurchasePayload('provider_purchase_create', { provider_name: 'P', amount: '1.00' })).toBe(true);
      expect(isProviderPurchasePayload('provider_purchase_update', { amount: '1.00' })).toBe(true);
      expect(isProviderPurchasePayload('provider_purchase_delete', {})).toBe(true);
      expect(isProviderPurchasePayload('stock_adjust' as SyncOperationType, {})).toBe(false);
    });
  });

  describe('validateTypedSyncPushEntry (All 11 Operations)', () => {
    const validEntries: Record<SyncOperationType, SyncPushEntry> = {
      sale_create: {
        id: 'outbox-1',
        idempotency_key: 'key-1',
        operation_type: 'sale_create',
        aggregate_type: 'sale',
        aggregate_id: 'sale-1',
        payload: {
          total: '100.00',
          items: [{ quantity: 1, unitPrice: '100.00', subtotal: '100.00' }],
          payments: [{ method: 'cash', amount: '100.00' }],
        },
        created_at: '2026-08-17T00:00:00.000Z',
      },
      stock_adjust: {
        id: 'outbox-2',
        idempotency_key: 'key-2',
        operation_type: 'stock_adjust',
        aggregate_type: 'stock',
        aggregate_id: 'stock-1',
        payload: { product_id: 'p-1', quantity: 10 },
        created_at: '2026-08-17T00:00:00.000Z',
      },
      product_create: {
        id: 'outbox-3',
        idempotency_key: 'key-3',
        operation_type: 'product_create',
        aggregate_type: 'product',
        aggregate_id: 'prod-1',
        payload: { detalle: 'Prod 1', costo_neto: '10.00' },
        created_at: '2026-08-17T00:00:00.000Z',
      },
      product_update: {
        id: 'outbox-4',
        idempotency_key: 'key-4',
        operation_type: 'product_update',
        aggregate_type: 'product',
        aggregate_id: 'prod-1',
        payload: { detalle: 'Updated', costo_final: '15.00' },
        created_at: '2026-08-17T00:00:00.000Z',
      },
      product_delete: {
        id: 'outbox-5',
        idempotency_key: 'key-5',
        operation_type: 'product_delete',
        aggregate_type: 'product',
        aggregate_id: 'prod-1',
        payload: {},
        created_at: '2026-08-17T00:00:00.000Z',
      },
      promotion_create: {
        id: 'outbox-6',
        idempotency_key: 'key-6',
        operation_type: 'promotion_create',
        aggregate_type: 'promotion',
        aggregate_id: 'promo-1',
        payload: { name: 'Promo 1', scope: 'global', type: 'percentage', discount_percent: 10 },
        created_at: '2026-08-17T00:00:00.000Z',
      },
      promotion_update: {
        id: 'outbox-7',
        idempotency_key: 'key-7',
        operation_type: 'promotion_update',
        aggregate_type: 'promotion',
        aggregate_id: 'promo-1',
        payload: { name: 'Promo Updated', enabled: false },
        created_at: '2026-08-17T00:00:00.000Z',
      },
      promotion_delete: {
        id: 'outbox-8',
        idempotency_key: 'key-8',
        operation_type: 'promotion_delete',
        aggregate_type: 'promotion',
        aggregate_id: 'promo-1',
        payload: {},
        created_at: '2026-08-17T00:00:00.000Z',
      },
      provider_purchase_create: {
        id: 'outbox-9',
        idempotency_key: 'key-9',
        operation_type: 'provider_purchase_create',
        aggregate_type: 'provider_purchase',
        aggregate_id: 'purchase-1',
        payload: { provider_name: 'Provider 1', amount: '500.00' },
        created_at: '2026-08-17T00:00:00.000Z',
      },
      provider_purchase_update: {
        id: 'outbox-10',
        idempotency_key: 'key-10',
        operation_type: 'provider_purchase_update',
        aggregate_type: 'provider_purchase',
        aggregate_id: 'purchase-1',
        payload: { amount: '600.00' },
        created_at: '2026-08-17T00:00:00.000Z',
      },
      provider_purchase_delete: {
        id: 'outbox-11',
        idempotency_key: 'key-11',
        operation_type: 'provider_purchase_delete',
        aggregate_type: 'provider_purchase',
        aggregate_id: 'purchase-1',
        payload: {},
        created_at: '2026-08-17T00:00:00.000Z',
      },
    };

    it.each(Object.keys(validEntries) as SyncOperationType[])(
      'successfully validates and narrows %s',
      (operation) => {
        const entry = validEntries[operation];
        const result = validateTypedSyncPushEntry(entry);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.entry).toBe(entry);
          expect(result.entry.operation_type).toBe(operation);
        }
      },
    );

    it('rejects unsupported operation_type', () => {
      const entry: any = {
        id: 'outbox-x',
        idempotency_key: 'key-x',
        operation_type: 'unsupported_op',
        aggregate_type: 'product',
        aggregate_id: 'x',
        payload: {},
        created_at: '2026-08-17T00:00:00.000Z',
      };
      const result = validateTypedSyncPushEntry(entry);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("Unsupported operation_type 'unsupported_op'.");
      }
    });

    it('rejects aggregate_type mismatch for promotion_create with product aggregate', () => {
      const entry: SyncPushEntry = {
        id: 'outbox-y',
        idempotency_key: 'key-y',
        operation_type: 'promotion_create',
        aggregate_type: 'product' as any,
        aggregate_id: 'p-1',
        payload: { name: 'Promo', scope: 'global', type: 'percentage' },
        created_at: '2026-08-17T00:00:00.000Z',
      };
      const result = validateTypedSyncPushEntry(entry);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("Operation 'promotion_create' requires aggregate_type 'promotion'.");
      }
    });

    it('preserves deep nested references and key order with zero side effects', () => {
      const nestedItem = { quantity: 2, unitPrice: '50.00', subtotal: '100.00' };
      const nestedPayment = { method: 'transfer' as const, amount: '100.00' };
      const rawPayload = {
        total: '100.00',
        items: [nestedItem],
        payments: [nestedPayment],
        customClientField: { nested: true },
      };

      const entry: SyncPushEntry = {
        id: 'outbox-pure',
        idempotency_key: 'inst:pure',
        operation_type: 'sale_create',
        aggregate_type: 'sale',
        aggregate_id: 'sale-pure',
        payload: rawPayload,
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = validateTypedSyncPushEntry(entry);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.entry.payload).toBe(rawPayload);
        if (result.entry.operation_type === 'sale_create') {
          expect(result.entry.payload.items[0]).toBe(nestedItem);
          expect(result.entry.payload.payments[0]).toBe(nestedPayment);
        }
      }
    });
  });
});
