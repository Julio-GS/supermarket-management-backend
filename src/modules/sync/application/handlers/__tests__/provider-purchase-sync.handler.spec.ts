import { Repository } from 'typeorm';
import { ProviderPurchaseSyncHandler } from '../provider-purchase-sync.handler';
import { ProviderPurchaseRepositoryPort } from '../../../../reports/application/provider-purchase.repository.port';
import { SyncTombstoneEntity } from '../../../infrastructure/sync-tombstone.entity';
import { ProviderPurchase } from '../../../../reports/domain/provider-purchase.entity';
import {
  ProviderPurchaseCreateEntry,
  ProviderPurchaseUpdateEntry,
  ProviderPurchaseDeleteEntry,
} from '../../../domain/sync-payloads';

describe('ProviderPurchaseSyncHandler', () => {
  let handler: ProviderPurchaseSyncHandler;
  let purchaseRepo: jest.Mocked<ProviderPurchaseRepositoryPort>;
  let tombstoneRepo: jest.Mocked<Repository<SyncTombstoneEntity>>;

  beforeEach(() => {
    purchaseRepo = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      aggregateByProvider: jest.fn(),
    } as unknown as jest.Mocked<ProviderPurchaseRepositoryPort>;

    tombstoneRepo = {
      save: jest.fn().mockResolvedValue({} as any),
    } as unknown as jest.Mocked<Repository<SyncTombstoneEntity>>;

    handler = new ProviderPurchaseSyncHandler(purchaseRepo, tombstoneRepo);
  });

  it('should declare supportedOperations containing provider_purchase_create, provider_purchase_update, provider_purchase_delete', () => {
    expect(handler.supportedOperations).toBeInstanceOf(Set);
    expect(handler.supportedOperations.has('provider_purchase_create')).toBe(true);
    expect(handler.supportedOperations.has('provider_purchase_update')).toBe(true);
    expect(handler.supportedOperations.has('provider_purchase_delete')).toBe(true);
    expect(handler.supportedOperations.size).toBe(3);
  });

  describe('provider_purchase_create', () => {
    it('should create provider purchase with defaults and return accepted result with server_id', async () => {
      const entry: ProviderPurchaseCreateEntry = {
        id: 'entry-purch-1',
        idempotency_key: 'idem-purch-1',
        operation_type: 'provider_purchase_create',
        aggregate_type: 'provider_purchase',
        aggregate_id: 'purch-new-1',
        payload: {
          provider_name: 'Distribuidora Central',
          amount: '15000.50',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const createdPurchase = { id: 'purch-server-123', provider_name: 'Distribuidora Central' } as ProviderPurchase;
      purchaseRepo.create.mockResolvedValue(createdPurchase);

      const result = await handler.handle(entry);

      expect(purchaseRepo.create).toHaveBeenCalledWith({
        provider_name: 'Distribuidora Central',
        amount: '15000.50',
        payment_method: undefined,
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'purch-server-123',
      });
    });

    it('should pass payment_method when provided', async () => {
      const entry: ProviderPurchaseCreateEntry = {
        id: 'entry-purch-2',
        idempotency_key: 'idem-purch-2',
        operation_type: 'provider_purchase_create',
        aggregate_type: 'provider_purchase',
        aggregate_id: 'purch-new-2',
        payload: {
          provider_name: 'Molinos Rio',
          amount: '25000.00',
          payment_method: 'transfer',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const createdPurchase = { id: 'purch-server-456' } as ProviderPurchase;
      purchaseRepo.create.mockResolvedValue(createdPurchase);

      const result = await handler.handle(entry);

      expect(purchaseRepo.create).toHaveBeenCalledWith({
        provider_name: 'Molinos Rio',
        amount: '25000.00',
        payment_method: 'transfer',
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'purch-server-456',
      });
    });
  });

  describe('provider_purchase_update', () => {
    it('should return conflict when base_server_version does not match current updated_at ISO string', async () => {
      const currentUpdatedAt = new Date('2026-08-17T12:00:00.000Z');
      const currentPurchase = {
        id: 'purch-1',
        updated_at: currentUpdatedAt,
      } as ProviderPurchase;
      purchaseRepo.findById.mockResolvedValue(currentPurchase);

      const entry: ProviderPurchaseUpdateEntry = {
        id: 'entry-upd-1',
        idempotency_key: 'idem-upd-1',
        operation_type: 'provider_purchase_update',
        aggregate_type: 'provider_purchase',
        aggregate_id: 'purch-1',
        base_server_version: '2026-08-10T00:00:00.000Z',
        payload: {
          amount: '18000.00',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(purchaseRepo.findById).toHaveBeenCalledWith('purch-1');
      expect(purchaseRepo.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: 'conflict',
        server_version: currentUpdatedAt.toISOString(),
        reason: `Server version ${currentUpdatedAt.toISOString()} differs from base version 2026-08-10T00:00:00.000Z. Another client has already updated this provider purchase.`,
      });
    });

    it('should return conflict when base_server_version does not match current string version', async () => {
      const currentPurchase = {
        id: 'purch-1',
        updated_at: 'version-v2' as unknown as Date,
      } as ProviderPurchase;
      purchaseRepo.findById.mockResolvedValue(currentPurchase);

      const entry: ProviderPurchaseUpdateEntry = {
        id: 'entry-upd-2',
        idempotency_key: 'idem-upd-2',
        operation_type: 'provider_purchase_update',
        aggregate_type: 'provider_purchase',
        aggregate_id: 'purch-1',
        base_server_version: 'version-v1',
        payload: {
          amount: '18000.00',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(purchaseRepo.findById).toHaveBeenCalledWith('purch-1');
      expect(purchaseRepo.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: 'conflict',
        server_version: 'version-v2',
        reason: 'Server version version-v2 differs from base version version-v1. Another client has already updated this provider purchase.',
      });
    });

    it('should update provider purchase when base_server_version matches', async () => {
      const currentUpdatedAt = new Date('2026-08-17T12:00:00.000Z');
      const currentPurchase = {
        id: 'purch-1',
        updated_at: currentUpdatedAt,
      } as ProviderPurchase;
      purchaseRepo.findById.mockResolvedValue(currentPurchase);
      purchaseRepo.update.mockResolvedValue({ id: 'purch-1' } as ProviderPurchase);

      const entry: ProviderPurchaseUpdateEntry = {
        id: 'entry-upd-3',
        idempotency_key: 'idem-upd-3',
        operation_type: 'provider_purchase_update',
        aggregate_type: 'provider_purchase',
        aggregate_id: 'purch-1',
        base_server_version: currentUpdatedAt.toISOString(),
        payload: {
          provider_name: 'Distribuidora Central S.A.',
          amount: '19000.00',
          payment_method: 'card',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(purchaseRepo.update).toHaveBeenCalledWith('purch-1', {
        provider_name: 'Distribuidora Central S.A.',
        amount: '19000.00',
        payment_method: 'card',
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'purch-1',
      });
    });

    it('should update provider purchase without base_server_version check when not provided', async () => {
      purchaseRepo.update.mockResolvedValue({ id: 'purch-1' } as ProviderPurchase);

      const entry: ProviderPurchaseUpdateEntry = {
        id: 'entry-upd-4',
        idempotency_key: 'idem-upd-4',
        operation_type: 'provider_purchase_update',
        aggregate_type: 'provider_purchase',
        aggregate_id: 'purch-1',
        payload: {
          amount: '20000.00',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(purchaseRepo.findById).not.toHaveBeenCalled();
      expect(purchaseRepo.update).toHaveBeenCalledWith('purch-1', {
        amount: '20000.00',
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'purch-1',
      });
    });

    it('should proceed to update when base_server_version is present but purchase is not found in findById', async () => {
      purchaseRepo.findById.mockResolvedValue(null);
      purchaseRepo.update.mockResolvedValue({ id: 'purch-not-found' } as ProviderPurchase);

      const entry: ProviderPurchaseUpdateEntry = {
        id: 'entry-upd-nf',
        idempotency_key: 'idem-upd-nf',
        operation_type: 'provider_purchase_update',
        aggregate_type: 'provider_purchase',
        aggregate_id: 'purch-not-found',
        base_server_version: '2026-08-10T00:00:00.000Z',
        payload: {
          amount: '500.00',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(purchaseRepo.findById).toHaveBeenCalledWith('purch-not-found');
      expect(purchaseRepo.update).toHaveBeenCalledWith('purch-not-found', {
        amount: '500.00',
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'purch-not-found',
      });
    });

    it('should allow clearing payment_method by passing null in update', async () => {
      purchaseRepo.update.mockResolvedValue({ id: 'purch-clear-pm' } as ProviderPurchase);

      const entry: ProviderPurchaseUpdateEntry = {
        id: 'entry-upd-clear',
        idempotency_key: 'idem-upd-clear',
        operation_type: 'provider_purchase_update',
        aggregate_type: 'provider_purchase',
        aggregate_id: 'purch-clear-pm',
        payload: {
          payment_method: null,
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(purchaseRepo.update).toHaveBeenCalledWith('purch-clear-pm', {
        payment_method: null,
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'purch-clear-pm',
      });
    });

    it('should fallback to aggregate_id if repo.update returns null', async () => {
      purchaseRepo.update.mockResolvedValue(null as any);

      const entry: ProviderPurchaseUpdateEntry = {
        id: 'entry-upd-5',
        idempotency_key: 'idem-upd-5',
        operation_type: 'provider_purchase_update',
        aggregate_type: 'provider_purchase',
        aggregate_id: 'purch-fallback-id',
        payload: {
          provider_name: 'Fallback Name',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(result).toEqual({
        status: 'accepted',
        server_id: 'purch-fallback-id',
      });
    });
  });

  describe('provider_purchase_delete', () => {
    it('should delete provider purchase and persist tombstone entity record', async () => {
      purchaseRepo.delete.mockResolvedValue(undefined);

      const entry: ProviderPurchaseDeleteEntry = {
        id: 'entry-del-1',
        idempotency_key: 'idem-del-1',
        operation_type: 'provider_purchase_delete',
        aggregate_type: 'provider_purchase',
        aggregate_id: 'purch-to-delete',
        payload: {},
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(purchaseRepo.delete).toHaveBeenCalledWith('purch-to-delete');
      expect(tombstoneRepo.save).toHaveBeenCalledWith({
        entity_id: 'purch-to-delete',
        aggregate_type: 'provider_purchase',
        operation_type: 'provider_purchase_delete',
      });
      expect(result).toEqual({
        status: 'accepted',
      });
    });
  });

  describe('unhandled operation', () => {
    it('should throw error for unsupported operation type', async () => {
      const invalidEntry = {
        id: 'entry-invalid',
        idempotency_key: 'idem-invalid',
        operation_type: 'unsupported_op' as any,
        aggregate_type: 'provider_purchase',
        aggregate_id: 'purch-x',
        payload: {},
        created_at: '2026-08-17T00:00:00.000Z',
      };

      await expect(handler.handle(invalidEntry as any)).rejects.toThrow(
        "Unhandled operation type 'unsupported_op'.",
      );
    });
  });
});
