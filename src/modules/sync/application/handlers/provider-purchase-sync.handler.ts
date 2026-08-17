import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncTombstoneEntity } from '../../infrastructure/sync-tombstone.entity';
import { ProviderPurchaseRepositoryPort } from '../../../reports/application/provider-purchase.repository.port';
import type { UpdateProviderPurchaseInput } from '../../../reports/application/provider-purchase.repository.port';
import type {
  ProviderPurchaseCreateEntry,
  ProviderPurchaseUpdateEntry,
  ProviderPurchaseDeleteEntry,
  EntryForOperation,
} from '../../domain/sync-payloads';
import {
  SyncOperationHandler,
  SyncHandlerResult,
} from '../ports/sync-operation-handler.port';

export type ProviderPurchaseSyncOperation =
  | 'provider_purchase_create'
  | 'provider_purchase_update'
  | 'provider_purchase_delete';

@Injectable()
export class ProviderPurchaseSyncHandler
  implements SyncOperationHandler<ProviderPurchaseSyncOperation>
{
  readonly supportedOperations: ReadonlySet<ProviderPurchaseSyncOperation> =
    new Set<ProviderPurchaseSyncOperation>([
      'provider_purchase_create',
      'provider_purchase_update',
      'provider_purchase_delete',
    ]);

  constructor(
    private readonly providerPurchaseRepo: ProviderPurchaseRepositoryPort,
    @InjectRepository(SyncTombstoneEntity)
    private readonly tombstoneRepo: Repository<SyncTombstoneEntity>,
  ) {}

  async handle(
    entry: EntryForOperation<ProviderPurchaseSyncOperation>,
  ): Promise<SyncHandlerResult> {
    switch (entry.operation_type) {
      case 'provider_purchase_create':
        return this.handleCreate(entry);
      case 'provider_purchase_update':
        return this.handleUpdate(entry);
      case 'provider_purchase_delete':
        return this.handleDelete(entry);
      default: {
        const unhandled =
          entry as EntryForOperation<ProviderPurchaseSyncOperation>;
        throw new Error(
          `Unhandled operation type '${unhandled.operation_type}'.`,
        );
      }
    }
  }

  private async handleCreate(
    entry: ProviderPurchaseCreateEntry,
  ): Promise<SyncHandlerResult> {
    const payload = entry.payload;

    const purchase = await this.providerPurchaseRepo.create({
      provider_name: payload.provider_name ?? '',
      amount: payload.amount ?? '0',
      payment_method: payload.payment_method ?? undefined,
    });

    return {
      status: 'accepted',
      server_id: purchase.id,
    };
  }

  private async handleUpdate(
    entry: ProviderPurchaseUpdateEntry,
  ): Promise<SyncHandlerResult> {
    const payload = entry.payload;

    // Server-authoritative conflict detection
    if (entry.base_server_version) {
      const current = await this.providerPurchaseRepo.findById(
        entry.aggregate_id,
      );
      if (current) {
        const currentVersion =
          current.updated_at instanceof Date
            ? current.updated_at.toISOString()
            : String(current.updated_at);
        if (currentVersion !== entry.base_server_version) {
          return {
            status: 'conflict',
            server_version: currentVersion,
            reason: `Server version ${currentVersion} differs from base version ${entry.base_server_version}. Another client has already updated this provider purchase.`,
          };
        }
      }
    }

    const updateInput: UpdateProviderPurchaseInput = {};
    if (payload.provider_name !== undefined)
      updateInput.provider_name = payload.provider_name;
    if (payload.amount !== undefined) updateInput.amount = payload.amount;
    if (payload.payment_method !== undefined)
      updateInput.payment_method = payload.payment_method;

    const purchase = await this.providerPurchaseRepo.update(
      entry.aggregate_id,
      updateInput,
    );

    const serverId = purchase?.id ?? entry.aggregate_id;

    return {
      status: 'accepted',
      server_id: serverId,
    };
  }

  private async handleDelete(
    entry: ProviderPurchaseDeleteEntry,
  ): Promise<SyncHandlerResult> {
    await this.providerPurchaseRepo.delete(entry.aggregate_id);

    // Record tombstone so pull can emit deletion changes.
    await this.tombstoneRepo.save({
      entity_id: entry.aggregate_id,
      aggregate_type: 'provider_purchase',
      operation_type: 'provider_purchase_delete',
    });

    return {
      status: 'accepted',
    };
  }
}
