import { StockSyncHandler } from '../stock-sync.handler';
import { InventoryRepositoryPort } from '../../../../inventory/application/inventory.repository.port';
import { StockAdjustEntry } from '../../../domain/sync-payloads';

describe('StockSyncHandler', () => {
  let handler: StockSyncHandler;
  let inventoryRepo: jest.Mocked<InventoryRepositoryPort>;

  beforeEach(() => {
    inventoryRepo = {
      findBalance: jest.fn(),
      findAllBalances: jest.fn(),
      findBalancesByIds: jest.fn(),
      createBalance: jest.fn(),
      adjustBalance: jest.fn(),
      findMovementsByProduct: jest.fn(),
    } as unknown as jest.Mocked<InventoryRepositoryPort>;

    handler = new StockSyncHandler(inventoryRepo);
  });

  it('should declare supportedOperations containing stock_adjust', () => {
    expect(handler.supportedOperations).toBeInstanceOf(Set);
    expect(handler.supportedOperations.has('stock_adjust')).toBe(true);
    expect(handler.supportedOperations.size).toBe(1);
  });

  describe('stock_adjust', () => {
    it('should adjust balance with explicit reason and referenceId and return accepted', async () => {
      const entry: StockAdjustEntry = {
        id: 'entry-stock-1',
        idempotency_key: 'idem-stock-1',
        operation_type: 'stock_adjust',
        aggregate_type: 'stock',
        aggregate_id: 'prod-uuid-1',
        payload: {
          product_id: 'prod-uuid-1',
          quantity: 15,
          reason: 'inventory_audit',
          referenceId: 'audit-batch-99',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      inventoryRepo.adjustBalance.mockResolvedValue({} as any);

      const result = await handler.handle(entry);

      expect(inventoryRepo.adjustBalance).toHaveBeenCalledTimes(1);
      expect(inventoryRepo.adjustBalance).toHaveBeenCalledWith(
        'prod-uuid-1',
        15,
        'adjustment',
        'audit-batch-99',
        'inventory_audit',
      );
      expect(result).toEqual({
        status: 'accepted',
      });
    });

    it('should use default reason "manual" and undefined referenceId when omitted', async () => {
      const entry: StockAdjustEntry = {
        id: 'entry-stock-2',
        idempotency_key: 'idem-stock-2',
        operation_type: 'stock_adjust',
        aggregate_type: 'stock',
        aggregate_id: 'prod-uuid-2',
        payload: {
          product_id: 'prod-uuid-2',
          quantity: -5,
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      inventoryRepo.adjustBalance.mockResolvedValue({} as any);

      const result = await handler.handle(entry);

      expect(inventoryRepo.adjustBalance).toHaveBeenCalledWith(
        'prod-uuid-2',
        -5,
        'adjustment',
        undefined,
        'manual',
      );
      expect(result).toEqual({
        status: 'accepted',
      });
    });

    it('should use default reason "manual" when reason is null', async () => {
      const entry: StockAdjustEntry = {
        id: 'entry-stock-3',
        idempotency_key: 'idem-stock-3',
        operation_type: 'stock_adjust',
        aggregate_type: 'stock',
        aggregate_id: 'prod-uuid-3',
        payload: {
          product_id: 'prod-uuid-3',
          quantity: 10,
          reason: null,
          referenceId: null,
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      inventoryRepo.adjustBalance.mockResolvedValue({} as any);

      const result = await handler.handle(entry);

      expect(inventoryRepo.adjustBalance).toHaveBeenCalledWith(
        'prod-uuid-3',
        10,
        'adjustment',
        undefined,
        'manual',
      );
      expect(result).toEqual({
        status: 'accepted',
      });
    });

    it('should handle zero quantity adjustment', async () => {
      const entry: StockAdjustEntry = {
        id: 'entry-stock-zero',
        idempotency_key: 'idem-stock-zero',
        operation_type: 'stock_adjust',
        aggregate_type: 'stock',
        aggregate_id: 'prod-uuid-zero',
        payload: {
          product_id: 'prod-uuid-zero',
          quantity: 0,
          reason: 'zero_adjustment',
          referenceId: 'ref-0',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      inventoryRepo.adjustBalance.mockResolvedValue({} as any);

      const result = await handler.handle(entry);

      expect(inventoryRepo.adjustBalance).toHaveBeenCalledWith(
        'prod-uuid-zero',
        0,
        'adjustment',
        'ref-0',
        'zero_adjustment',
      );
      expect(result).toEqual({
        status: 'accepted',
      });
    });
  });

  describe('unhandled operation', () => {
    it('should throw an error if called with an unsupported operation', async () => {
      const entry = {
        id: 'entry-invalid',
        idempotency_key: 'idem-invalid',
        operation_type: 'sale_create',
        aggregate_type: 'sale',
        aggregate_id: 's-1',
        payload: { total: '100.00', items: [], payments: [] },
        created_at: '2026-08-17T00:00:00.000Z',
      } as any;

      await expect(handler.handle(entry)).rejects.toThrow(
        "Unhandled operation type 'sale_create'.",
      );
    });
  });
});
