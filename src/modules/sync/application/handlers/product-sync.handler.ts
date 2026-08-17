import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncTombstoneEntity } from '../../infrastructure/sync-tombstone.entity';
import { ProductRepositoryPort } from '../../../products/application/product.repository.port';
import { TransactionRunnerPort } from '../../../../shared/database/transaction-runner.port';
import { AutoLabelJobService } from '../../../label-printer/application/auto-label-job.service';
import type { ProductUpdateInput } from '../../../products/application/product.repository.port';
import type { Product } from '../../../products/domain/product.entity';
import type {
  ProductCreateEntry,
  ProductUpdateEntry,
  ProductDeleteEntry,
  EntryForOperation,
} from '../../domain/sync-payloads';
import {
  SyncOperationHandler,
  SyncHandlerResult,
} from '../ports/sync-operation-handler.port';

export type ProductSyncOperation =
  | 'product_create'
  | 'product_update'
  | 'product_delete';

@Injectable()
export class ProductSyncHandler
  implements SyncOperationHandler<ProductSyncOperation>
{
  readonly supportedOperations: ReadonlySet<ProductSyncOperation> =
    new Set<ProductSyncOperation>([
      'product_create',
      'product_update',
      'product_delete',
    ]);

  constructor(
    private readonly productRepo: ProductRepositoryPort,
    private readonly transactionRunner: TransactionRunnerPort,
    private readonly autoLabel: AutoLabelJobService,
    @InjectRepository(SyncTombstoneEntity)
    private readonly tombstoneRepo: Repository<SyncTombstoneEntity>,
  ) {}

  async handle(
    entry: EntryForOperation<ProductSyncOperation>,
  ): Promise<SyncHandlerResult> {
    switch (entry.operation_type) {
      case 'product_create':
        return this.handleCreate(entry);
      case 'product_update':
        return this.handleUpdate(entry);
      case 'product_delete':
        return this.handleDelete(entry);
      default: {
        const unhandled: never = entry;
        throw new Error(
          `Unhandled operation type '${(unhandled as EntryForOperation<ProductSyncOperation>).operation_type}'.`,
        );
      }
    }
  }

  private async handleCreate(
    entry: ProductCreateEntry,
  ): Promise<SyncHandlerResult> {
    const payload = entry.payload;

    const product = await this.productRepo.create({
      detalle: payload.detalle ?? '',
      costo_neto: payload.costo_neto ?? null,
      costo_final: payload.costo_final ?? null,
      iva: payload.iva ?? null,
      cambio_costo: payload.cambio_costo ?? 'fixed',
      cambio_precio: payload.cambio_precio ?? 'fixed',
      etiqueta: payload.etiqueta ?? '',
      facturable: payload.facturable ?? true,
      maneja_stock: payload.maneja_stock ?? true,
      codigos: payload.codigos ?? [],
    });

    return {
      status: 'accepted',
      server_id: product.id,
    };
  }

  private async handleUpdate(
    entry: ProductUpdateEntry,
  ): Promise<SyncHandlerResult> {
    const payload = entry.payload;

    // Server-authoritative conflict detection: when the client provides a
    // base_server_version, compare it against the current entity version.
    // If another client updated the entity, reject with conflict.
    if (entry.base_server_version) {
      const current = await this.productRepo.findById(entry.aggregate_id);
      if (current) {
        const currentVersion =
          current.updated_at instanceof Date
            ? current.updated_at.toISOString()
            : String(current.updated_at);
        if (currentVersion !== entry.base_server_version) {
          return {
            status: 'conflict',
            server_version: currentVersion,
            reason: `Server version ${currentVersion} differs from base version ${entry.base_server_version}. Another client has already updated this product.`,
          };
        }
      }
    }

    const updateInput: ProductUpdateInput = {};
    if (payload.detalle !== undefined) updateInput.detalle = payload.detalle;
    if (payload.costo_neto !== undefined) updateInput.costo_neto = payload.costo_neto;
    if (payload.costo_final !== undefined) updateInput.costo_final = payload.costo_final;
    if (payload.iva !== undefined) updateInput.iva = payload.iva;
    if (payload.cambio_costo !== undefined)
      updateInput.cambio_costo = payload.cambio_costo ?? undefined;
    if (payload.cambio_precio !== undefined)
      updateInput.cambio_precio = payload.cambio_precio ?? undefined;
    if (payload.etiqueta !== undefined)
      updateInput.etiqueta = payload.etiqueta ?? undefined;
    if (payload.facturable !== undefined) updateInput.facturable = payload.facturable;
    if (payload.maneja_stock !== undefined) updateInput.maneja_stock = payload.maneja_stock;
    if (payload.codigos !== undefined) updateInput.codigos = payload.codigos;

    // Fetch current product when price may change (needed for comparison and snapshot)
    let current: Product | null = null;
    if (payload.costo_final !== undefined) {
      current = await this.productRepo.findById(entry.aggregate_id);
    }

    const priceChanged =
      payload.costo_final !== undefined &&
      payload.costo_final !== current?.costo_final;

    let product: Product | null;
    if (priceChanged) {
      product = await this.transactionRunner.run(async (runner) => {
        const updated = await this.productRepo.update(
          entry.aggregate_id,
          updateInput,
          runner,
        );
        await this.autoLabel.onProductPriceChanged(
          {
            id: entry.aggregate_id,
            detalle: current?.detalle ?? '',
            costo_final: current?.costo_final ?? null,
            codigos: current?.codigos ?? [],
          },
          payload.costo_final ?? null,
          runner,
        );
        return updated;
      });
    } else {
      product = await this.productRepo.update(entry.aggregate_id, updateInput);
    }

    const serverId = product?.id ?? entry.aggregate_id;

    return {
      status: 'accepted',
      server_id: serverId,
    };
  }

  private async handleDelete(
    entry: ProductDeleteEntry,
  ): Promise<SyncHandlerResult> {
    await this.productRepo.delete(entry.aggregate_id);

    // Record tombstone so pull can emit deletion changes.
    await this.tombstoneRepo.save({
      entity_id: entry.aggregate_id,
      aggregate_type: 'product',
      operation_type: 'product_delete',
    });

    return {
      status: 'accepted',
    };
  }
}
