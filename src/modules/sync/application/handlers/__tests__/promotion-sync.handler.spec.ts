import { Repository } from 'typeorm';
import { PromotionSyncHandler } from '../promotion-sync.handler';
import { PromotionRepositoryPort } from '../../../../promotions/application/promotion.repository.port';
import { SyncTombstoneEntity } from '../../../infrastructure/sync-tombstone.entity';
import { Promotion } from '../../../../promotions/domain/promotion.entity';
import {
  PromotionCreateEntry,
  PromotionUpdateEntry,
  PromotionDeleteEntry,
} from '../../../domain/sync-payloads';

describe('PromotionSyncHandler', () => {
  let handler: PromotionSyncHandler;
  let promoRepo: jest.Mocked<PromotionRepositoryPort>;
  let tombstoneRepo: jest.Mocked<Repository<SyncTombstoneEntity>>;

  beforeEach(() => {
    promoRepo = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findActiveByProductIds: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<PromotionRepositoryPort>;

    tombstoneRepo = {
      save: jest.fn().mockResolvedValue({} as any),
    } as unknown as jest.Mocked<Repository<SyncTombstoneEntity>>;

    handler = new PromotionSyncHandler(promoRepo, tombstoneRepo);
  });

  it('should declare supportedOperations containing promotion_create, promotion_update, promotion_delete', () => {
    expect(handler.supportedOperations).toBeInstanceOf(Set);
    expect(handler.supportedOperations.has('promotion_create')).toBe(true);
    expect(handler.supportedOperations.has('promotion_update')).toBe(true);
    expect(handler.supportedOperations.has('promotion_delete')).toBe(true);
    expect(handler.supportedOperations.size).toBe(3);
  });

  describe('promotion_create', () => {
    it('should create promotion with defaults and return accepted result with server_id', async () => {
      const entry: PromotionCreateEntry = {
        id: 'entry-promo-1',
        idempotency_key: 'idem-promo-1',
        operation_type: 'promotion_create',
        aggregate_type: 'promotion',
        aggregate_id: 'promo-new-1',
        payload: {
          name: 'Promo Verano',
          scope: 'product',
          type: 'percentage',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const createdPromotion = { id: 'promo-server-123', name: 'Promo Verano' } as Promotion;
      promoRepo.create.mockResolvedValue(createdPromotion);

      const result = await handler.handle(entry);

      expect(promoRepo.create).toHaveBeenCalledWith({
        name: 'Promo Verano',
        description: null,
        scope: 'product',
        product_id: null,
        type: 'percentage',
        discount_percent: null,
        start_date: null,
        end_date: null,
        weekdays: null,
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'promo-server-123',
      });
    });

    it('should parse start_date and end_date as Date objects when provided', async () => {
      const entry: PromotionCreateEntry = {
        id: 'entry-promo-2',
        idempotency_key: 'idem-promo-2',
        operation_type: 'promotion_create',
        aggregate_type: 'promotion',
        aggregate_id: 'promo-new-2',
        payload: {
          name: 'Promo Finde',
          description: 'Descuento fin de semana',
          scope: 'global',
          product_id: 'prod-123',
          type: 'fixed_amount',
          discount_percent: 15,
          start_date: '2026-08-20T00:00:00.000Z',
          end_date: '2026-08-22T23:59:59.999Z',
          weekdays: [5, 6, 0],
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const createdPromotion = { id: 'promo-server-456' } as Promotion;
      promoRepo.create.mockResolvedValue(createdPromotion);

      const result = await handler.handle(entry);

      expect(promoRepo.create).toHaveBeenCalledWith({
        name: 'Promo Finde',
        description: 'Descuento fin de semana',
        scope: 'global',
        product_id: 'prod-123',
        type: 'fixed_amount',
        discount_percent: 15,
        start_date: new Date('2026-08-20T00:00:00.000Z'),
        end_date: new Date('2026-08-22T23:59:59.999Z'),
        weekdays: [5, 6, 0],
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'promo-server-456',
      });
    });
  });

  describe('promotion_update', () => {
    it('should return conflict when base_server_version does not match current updated_at ISO string', async () => {
      const currentUpdatedAt = new Date('2026-08-17T12:00:00.000Z');
      const currentPromotion = {
        id: 'promo-1',
        updated_at: currentUpdatedAt,
      } as Promotion;
      promoRepo.findById.mockResolvedValue(currentPromotion);

      const entry: PromotionUpdateEntry = {
        id: 'entry-upd-1',
        idempotency_key: 'idem-upd-1',
        operation_type: 'promotion_update',
        aggregate_type: 'promotion',
        aggregate_id: 'promo-1',
        base_server_version: '2026-08-10T00:00:00.000Z',
        payload: {
          name: 'Updated Name',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(promoRepo.findById).toHaveBeenCalledWith('promo-1');
      expect(promoRepo.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: 'conflict',
        server_version: currentUpdatedAt.toISOString(),
        reason: `Server version ${currentUpdatedAt.toISOString()} differs from base version 2026-08-10T00:00:00.000Z. Another client has already updated this promotion.`,
      });
    });

    it('should return conflict when base_server_version does not match current string version', async () => {
      const currentPromotion = {
        id: 'promo-1',
        updated_at: 'version-v2' as unknown as Date,
      } as Promotion;
      promoRepo.findById.mockResolvedValue(currentPromotion);

      const entry: PromotionUpdateEntry = {
        id: 'entry-upd-2',
        idempotency_key: 'idem-upd-2',
        operation_type: 'promotion_update',
        aggregate_type: 'promotion',
        aggregate_id: 'promo-1',
        base_server_version: 'version-v1',
        payload: {
          name: 'Updated Name',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(promoRepo.findById).toHaveBeenCalledWith('promo-1');
      expect(promoRepo.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        status: 'conflict',
        server_version: 'version-v2',
        reason: 'Server version version-v2 differs from base version version-v1. Another client has already updated this promotion.',
      });
    });

    it('should update promotion when base_server_version matches', async () => {
      const currentUpdatedAt = new Date('2026-08-17T12:00:00.000Z');
      const currentPromotion = {
        id: 'promo-1',
        updated_at: currentUpdatedAt,
      } as Promotion;
      promoRepo.findById.mockResolvedValue(currentPromotion);
      promoRepo.update.mockResolvedValue({ id: 'promo-1' } as Promotion);

      const entry: PromotionUpdateEntry = {
        id: 'entry-upd-3',
        idempotency_key: 'idem-upd-3',
        operation_type: 'promotion_update',
        aggregate_type: 'promotion',
        aggregate_id: 'promo-1',
        base_server_version: currentUpdatedAt.toISOString(),
        payload: {
          name: 'Updated Name',
          description: 'Updated desc',
          scope: 'store' as any,
          product_id: 'prod-abc',
          type: 'percentage',
          discount_percent: 20,
          start_date: '2026-09-01T00:00:00.000Z',
          end_date: '2026-09-30T00:00:00.000Z',
          weekdays: [1, 2, 3],
          enabled: false,
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(promoRepo.update).toHaveBeenCalledWith('promo-1', {
        name: 'Updated Name',
        description: 'Updated desc',
        scope: 'store',
        product_id: 'prod-abc',
        type: 'percentage',
        discount_percent: 20,
        start_date: new Date('2026-09-01T00:00:00.000Z'),
        end_date: new Date('2026-09-30T00:00:00.000Z'),
        weekdays: [1, 2, 3],
        enabled: false,
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'promo-1',
      });
    });

    it('should update promotion without base_server_version check when not provided', async () => {
      promoRepo.update.mockResolvedValue({ id: 'promo-1' } as Promotion);

      const entry: PromotionUpdateEntry = {
        id: 'entry-upd-4',
        idempotency_key: 'idem-upd-4',
        operation_type: 'promotion_update',
        aggregate_type: 'promotion',
        aggregate_id: 'promo-1',
        payload: {
          name: 'Only Name Update',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(promoRepo.findById).not.toHaveBeenCalled();
      expect(promoRepo.update).toHaveBeenCalledWith('promo-1', {
        name: 'Only Name Update',
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'promo-1',
      });
    });

    it('should proceed to update when base_server_version is present but promotion is not found in findById', async () => {
      promoRepo.findById.mockResolvedValue(null);
      promoRepo.update.mockResolvedValue({ id: 'promo-not-found' } as Promotion);

      const entry: PromotionUpdateEntry = {
        id: 'entry-upd-nf',
        idempotency_key: 'idem-upd-nf',
        operation_type: 'promotion_update',
        aggregate_type: 'promotion',
        aggregate_id: 'promo-not-found',
        base_server_version: '2026-08-10T00:00:00.000Z',
        payload: {
          name: 'Name For Missing Promo',
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(promoRepo.findById).toHaveBeenCalledWith('promo-not-found');
      expect(promoRepo.update).toHaveBeenCalledWith('promo-not-found', {
        name: 'Name For Missing Promo',
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'promo-not-found',
      });
    });

    it('should handle null/empty start_date and end_date in update', async () => {
      promoRepo.update.mockResolvedValue({ id: 'promo-dates' } as Promotion);

      const entry: PromotionUpdateEntry = {
        id: 'entry-upd-dates',
        idempotency_key: 'idem-upd-dates',
        operation_type: 'promotion_update',
        aggregate_type: 'promotion',
        aggregate_id: 'promo-dates',
        payload: {
          start_date: null,
          end_date: null,
          description: null,
          weekdays: [],
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(promoRepo.update).toHaveBeenCalledWith('promo-dates', {
        start_date: null,
        end_date: null,
        description: null,
        weekdays: [],
      });
      expect(result).toEqual({
        status: 'accepted',
        server_id: 'promo-dates',
      });
    });

    it('should fallback to aggregate_id if repo.update returns null', async () => {
      promoRepo.update.mockResolvedValue(null);

      const entry: PromotionUpdateEntry = {
        id: 'entry-upd-5',
        idempotency_key: 'idem-upd-5',
        operation_type: 'promotion_update',
        aggregate_type: 'promotion',
        aggregate_id: 'promo-fallback-id',
        payload: {
          enabled: true,
        },
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(result).toEqual({
        status: 'accepted',
        server_id: 'promo-fallback-id',
      });
    });
  });

  describe('promotion_delete', () => {
    it('should delete promotion and persist tombstone entity record', async () => {
      promoRepo.delete.mockResolvedValue(undefined);

      const entry: PromotionDeleteEntry = {
        id: 'entry-del-1',
        idempotency_key: 'idem-del-1',
        operation_type: 'promotion_delete',
        aggregate_type: 'promotion',
        aggregate_id: 'promo-to-delete',
        payload: {},
        created_at: '2026-08-17T00:00:00.000Z',
      };

      const result = await handler.handle(entry);

      expect(promoRepo.delete).toHaveBeenCalledWith('promo-to-delete');
      expect(tombstoneRepo.save).toHaveBeenCalledWith({
        entity_id: 'promo-to-delete',
        aggregate_type: 'promotion',
        operation_type: 'promotion_delete',
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
        aggregate_type: 'promotion',
        aggregate_id: 'promo-x',
        payload: {},
        created_at: '2026-08-17T00:00:00.000Z',
      };

      await expect(handler.handle(invalidEntry as any)).rejects.toThrow(
        "Unhandled operation type 'unsupported_op'.",
      );
    });
  });
});
