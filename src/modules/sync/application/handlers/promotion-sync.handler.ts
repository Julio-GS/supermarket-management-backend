import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncTombstoneEntity } from '../../infrastructure/sync-tombstone.entity';
import { PromotionRepositoryPort } from '../../../promotions/application/promotion.repository.port';
import type {
  CreatePromotionInput,
  UpdatePromotionInput,
} from '../../../promotions/application/promotion.repository.port';
import type {
  PromotionCreateEntry,
  PromotionUpdateEntry,
  PromotionDeleteEntry,
  EntryForOperation,
} from '../../domain/sync-payloads';
import {
  SyncOperationHandler,
  SyncHandlerResult,
} from '../ports/sync-operation-handler.port';

export type PromotionSyncOperation =
  | 'promotion_create'
  | 'promotion_update'
  | 'promotion_delete';

@Injectable()
export class PromotionSyncHandler
  implements SyncOperationHandler<PromotionSyncOperation>
{
  readonly supportedOperations: ReadonlySet<PromotionSyncOperation> =
    new Set<PromotionSyncOperation>([
      'promotion_create',
      'promotion_update',
      'promotion_delete',
    ]);

  constructor(
    private readonly promoRepo: PromotionRepositoryPort,
    @InjectRepository(SyncTombstoneEntity)
    private readonly tombstoneRepo: Repository<SyncTombstoneEntity>,
  ) {}

  async handle(
    entry: EntryForOperation<PromotionSyncOperation>,
  ): Promise<SyncHandlerResult> {
    switch (entry.operation_type) {
      case 'promotion_create':
        return this.handleCreate(entry);
      case 'promotion_update':
        return this.handleUpdate(entry);
      case 'promotion_delete':
        return this.handleDelete(entry);
      default: {
        const unhandled = entry as EntryForOperation<PromotionSyncOperation>;
        throw new Error(
          `Unhandled operation type '${unhandled.operation_type}'.`,
        );
      }
    }
  }

  private async handleCreate(
    entry: PromotionCreateEntry,
  ): Promise<SyncHandlerResult> {
    const payload = entry.payload;

    const input: CreatePromotionInput = {
      name: payload.name ?? '',
      description: payload.description ?? null,
      scope: (payload.scope as CreatePromotionInput['scope']) ?? 'product',
      product_id: payload.product_id ?? null,
      type: (payload.type as CreatePromotionInput['type']) ?? 'percentage',
      discount_percent: payload.discount_percent ?? null,
      start_date: payload.start_date ? new Date(payload.start_date) : null,
      end_date: payload.end_date ? new Date(payload.end_date) : null,
      weekdays: payload.weekdays ?? null,
    };

    const promotion = await this.promoRepo.create(input);

    return {
      status: 'accepted',
      server_id: promotion.id,
    };
  }

  private async handleUpdate(
    entry: PromotionUpdateEntry,
  ): Promise<SyncHandlerResult> {
    const payload = entry.payload;

    // Server-authoritative conflict detection
    if (entry.base_server_version) {
      const current = await this.promoRepo.findById(entry.aggregate_id);
      if (current) {
        const currentVersion =
          current.updated_at instanceof Date
            ? current.updated_at.toISOString()
            : String(current.updated_at);
        if (currentVersion !== entry.base_server_version) {
          return {
            status: 'conflict',
            server_version: currentVersion,
            reason: `Server version ${currentVersion} differs from base version ${entry.base_server_version}. Another client has already updated this promotion.`,
          };
        }
      }
    }

    const updateInput: UpdatePromotionInput = {};
    if (payload.name !== undefined) updateInput.name = payload.name;
    if (payload.description !== undefined)
      updateInput.description = payload.description;
    if (payload.scope !== undefined)
      updateInput.scope = payload.scope as UpdatePromotionInput['scope'];
    if (payload.product_id !== undefined)
      updateInput.product_id = payload.product_id;
    if (payload.type !== undefined)
      updateInput.type = payload.type as UpdatePromotionInput['type'];
    if (payload.discount_percent !== undefined)
      updateInput.discount_percent = payload.discount_percent;
    if (payload.start_date !== undefined)
      updateInput.start_date = payload.start_date
        ? new Date(payload.start_date)
        : null;
    if (payload.end_date !== undefined)
      updateInput.end_date = payload.end_date ? new Date(payload.end_date) : null;
    if (payload.weekdays !== undefined) updateInput.weekdays = payload.weekdays;
    if (payload.enabled !== undefined) updateInput.enabled = payload.enabled;

    const promotion = await this.promoRepo.update(
      entry.aggregate_id,
      updateInput,
    );

    const serverId = promotion?.id ?? entry.aggregate_id;

    return {
      status: 'accepted',
      server_id: serverId,
    };
  }

  private async handleDelete(
    entry: PromotionDeleteEntry,
  ): Promise<SyncHandlerResult> {
    await this.promoRepo.delete(entry.aggregate_id);

    // Record tombstone so pull can emit deletion changes.
    await this.tombstoneRepo.save({
      entity_id: entry.aggregate_id,
      aggregate_type: 'promotion',
      operation_type: 'promotion_delete',
    });

    return {
      status: 'accepted',
    };
  }
}
