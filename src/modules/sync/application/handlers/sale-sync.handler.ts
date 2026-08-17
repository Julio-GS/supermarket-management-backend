import { Injectable } from '@nestjs/common';
import { SaleRepositoryPort } from '../../../sales/application/sale.repository.port';
import type {
  SaleCreateEntry,
  PaymentMethod,
  EntryForOperation,
} from '../../domain/sync-payloads';
import {
  SyncOperationHandler,
  SyncHandlerResult,
} from '../ports/sync-operation-handler.port';

export type SaleSyncOperation = 'sale_create';

const VALID_PAYMENT_METHODS: ReadonlySet<string> = new Set<string>([
  'cash',
  'transfer',
  'card',
  'qr',
]);

@Injectable()
export class SaleSyncHandler implements SyncOperationHandler<SaleSyncOperation> {
  readonly supportedOperations: ReadonlySet<SaleSyncOperation> =
    new Set<SaleSyncOperation>(['sale_create']);

  constructor(private readonly saleRepo: SaleRepositoryPort) {}

  async handle(
    entry: EntryForOperation<SaleSyncOperation>,
  ): Promise<SyncHandlerResult> {
    switch (entry.operation_type) {
      case 'sale_create':
        return this.handleSaleCreate(entry);
      default: {
        const unhandled = entry as EntryForOperation<SaleSyncOperation>;
        throw new Error(
          `Unhandled operation type '${unhandled.operation_type}'.`,
        );
      }
    }
  }

  private async handleSaleCreate(
    entry: SaleCreateEntry,
  ): Promise<SyncHandlerResult> {
    const payload = entry.payload;

    const sale = await this.saleRepo.create({
      user_id: entry.actor_user_id ?? 'unknown',
      items: (payload.items ?? []).map((item) => ({
        product_id: item.productId ?? null,
        name: item.name ?? null,
        description: item.description ?? null,
        quantity: item.quantity ?? 0,
        unit_price: item.unitPrice ?? '0',
        subtotal: item.subtotal ?? '0',
        discount_amount: item.discountAmount ?? '0.00',
      })),
      total: payload.total ?? '0',
      payment_methods: (payload.payments ?? []).map((p) => {
        const rawMethod = p.method ?? 'cash';
        const method: PaymentMethod = VALID_PAYMENT_METHODS.has(rawMethod)
          ? (rawMethod as PaymentMethod)
          : 'cash';
        return {
          method,
          amount: p.amount ?? '0',
        };
      }),
      invoice_status: 'none',
    });

    return {
      status: 'accepted',
      server_id: sale.id,
    };
  }
}
