import { Injectable } from '@nestjs/common';
import { InventoryRepositoryPort } from '../../../inventory/application/inventory.repository.port';
import { StockMovementType } from '../../../inventory/domain/inventory.entity';
import type {
  StockAdjustEntry,
  EntryForOperation,
} from '../../domain/sync-payloads';
import {
  SyncOperationHandler,
  SyncHandlerResult,
} from '../ports/sync-operation-handler.port';

export type StockSyncOperation = 'stock_adjust';

const STOCK_ADJUSTMENT: StockMovementType = 'adjustment';

@Injectable()
export class StockSyncHandler implements SyncOperationHandler<StockSyncOperation> {
  readonly supportedOperations: ReadonlySet<StockSyncOperation> =
    new Set<StockSyncOperation>(['stock_adjust']);

  constructor(private readonly inventoryRepo: InventoryRepositoryPort) {}

  async handle(
    entry: EntryForOperation<StockSyncOperation>,
  ): Promise<SyncHandlerResult> {
    switch (entry.operation_type) {
      case 'stock_adjust':
        return this.handleStockAdjust(entry);
      default: {
        const unhandled = entry as EntryForOperation<StockSyncOperation>;
        throw new Error(
          `Unhandled operation type '${unhandled.operation_type}'.`,
        );
      }
    }
  }

  private async handleStockAdjust(
    entry: StockAdjustEntry,
  ): Promise<SyncHandlerResult> {
    const payload = entry.payload;
    const productId = payload.product_id;
    const quantity = payload.quantity;
    const reason = payload.reason ?? 'manual';
    const referenceId = payload.referenceId ?? undefined;

    await this.inventoryRepo.adjustBalance(
      productId,
      quantity,
      STOCK_ADJUSTMENT,
      referenceId,
      reason,
    );

    return {
      status: 'accepted',
    };
  }
}
