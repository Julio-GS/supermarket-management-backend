import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IdempotencyService } from "./idempotency.service";
import { SyncTombstoneEntity } from "../infrastructure/sync-tombstone.entity";
import { SaleRepositoryPort } from "../../sales/application/sale.repository.port";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { PromotionRepositoryPort } from "../../promotions/application/promotion.repository.port";
import { ProviderPurchaseRepositoryPort } from "../../reports/application/provider-purchase.repository.port";
import { StockMovementType } from "../../inventory/domain/inventory.entity";
import type {
  SyncPushEntry,
  SyncPushRequest,
  SyncPushResponse,
  SyncPushResultEntry,
  SyncOperationType,
  SyncOperationStatus,
} from "./sync.types";
import type { CreatePromotionInput, UpdatePromotionInput } from "../../promotions/application/promotion.repository.port";
import type { ProductUpdateInput } from "../../products/application/product.repository.port";
import type { UpdateProviderPurchaseInput } from "../../reports/application/provider-purchase.repository.port";
import { TransactionRunnerPort } from "../../../shared/database/transaction-runner.port";
import { AutoLabelJobService } from "../../label-printer/application/auto-label-job.service";

const STOCK_ADJUSTMENT: StockMovementType = "adjustment";

/** Valid payment methods for sale creation. */
type PaymentMethod = "cash" | "transfer" | "card" | "qr";
const VALID_PAYMENT_METHODS: ReadonlySet<string> = new Set([
  "cash",
  "transfer",
  "card",
  "qr",
]);

/**
 * Process a batch of outbox entries pushed by a desktop client.
 *
 * Ordering contract: entries are processed in the order they appear in the
 * request array.  When an entry fails (transient or permanent), later
 * entries are NOT attempted — they are returned with status `blocked` so
 * the client knows to keep them `pending` and retry after the blocker is
 * resolved.
 *
 * Idempotency: every operation is keyed by {@link SyncPushEntry.idempotency_key}.
 * Duplicate keys with the same payload return the original result without
 * re-executing.  Duplicate keys with a **different** payload are rejected
 * as an idempotency violation (status `conflict`).
 */
@Injectable()
export class PushUseCase {
  // Operation types that this slice supports (Slice 5: all modules).
  private static readonly SUPPORTED_OPS: ReadonlySet<SyncOperationType> =
    new Set([
      "sale_create",
      "stock_adjust",
      "product_create",
      "product_update",
      "product_delete",
      "promotion_create",
      "promotion_update",
      "promotion_delete",
      "provider_purchase_create",
      "provider_purchase_update",
      "provider_purchase_delete",
    ]);

  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly saleRepo: SaleRepositoryPort,
    private readonly inventoryRepo: InventoryRepositoryPort,
    private readonly productRepo: ProductRepositoryPort,
    private readonly promotionRepo: PromotionRepositoryPort,
    private readonly providerPurchaseRepo: ProviderPurchaseRepositoryPort,
    private readonly transactionRunner: TransactionRunnerPort,
    private readonly autoLabel: AutoLabelJobService,
    @InjectRepository(SyncTombstoneEntity)
    private readonly tombstoneRepo: Repository<SyncTombstoneEntity>,
  ) {}

  async execute(request: SyncPushRequest): Promise<SyncPushResponse> {
    const results: SyncPushResultEntry[] = [];
    let blocked = false;

    for (const entry of request.entries) {
      if (blocked) {
        results.push(this.blockedResult(entry));
        continue;
      }

      const result = await this.processEntry(entry);
      results.push(result);

      if (result.status !== "accepted" && result.status !== "duplicate") {
        blocked = true;
      }
    }

    return { results };
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private blockedResult(entry: SyncPushEntry): SyncPushResultEntry {
    return {
      id: entry.id,
      idempotency_key: entry.idempotency_key,
      status: "blocked" as SyncOperationStatus,
      reason:
        "Blocked by a previous entry failure. This entry was not attempted.",
    };
  }

  private async processEntry(
    entry: SyncPushEntry,
  ): Promise<SyncPushResultEntry> {
    // 1 — Duplicate check (same key + same payload)
    if (
      await this.idempotency.hasBeenProcessed(
        entry.idempotency_key,
        entry.payload,
      )
    ) {
      const existing = await this.idempotency.findExistingResult(
        entry.idempotency_key,
      );
      return {
        id: entry.id,
        idempotency_key: entry.idempotency_key,
        status: "duplicate",
        server_id: existing?.server_id ?? null,
        server_version: existing?.server_version ?? null,
        reason: existing?.reason ?? null,
      };
    }

    // 2 — Idempotency violation check (same key, different payload)
    try {
      await this.idempotency.checkIdempotencyViolation(
        entry.idempotency_key,
        entry.payload,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        id: entry.id,
        idempotency_key: entry.idempotency_key,
        status: "conflict",
        reason,
      };
    }

    // 3 — Check if the operation type is supported
    if (!PushUseCase.SUPPORTED_OPS.has(entry.operation_type)) {
      return {
        id: entry.id,
        idempotency_key: entry.idempotency_key,
        status: "validation_error",
        reason: `Operation type '${entry.operation_type}' is not yet supported in this slice.`,
      };
    }

    // 4 — Dispatch by operation type
    try {
      return await this.dispatch(entry);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return {
        id: entry.id,
        idempotency_key: entry.idempotency_key,
        status: "transient_error",
        reason,
      };
    }
  }

  private async dispatch(
    entry: SyncPushEntry,
  ): Promise<SyncPushResultEntry> {
    switch (entry.operation_type) {
      case "sale_create":
        return this.handleSaleCreate(entry);
      case "stock_adjust":
        return this.handleStockAdjust(entry);
      case "product_create":
        return this.handleProductCreate(entry);
      case "product_update":
        return this.handleProductUpdate(entry);
      case "product_delete":
        return this.handleProductDelete(entry);
      case "promotion_create":
        return this.handlePromotionCreate(entry);
      case "promotion_update":
        return this.handlePromotionUpdate(entry);
      case "promotion_delete":
        return this.handlePromotionDelete(entry);
      case "provider_purchase_create":
        return this.handleProviderPurchaseCreate(entry);
      case "provider_purchase_update":
        return this.handleProviderPurchaseUpdate(entry);
      case "provider_purchase_delete":
        return this.handleProviderPurchaseDelete(entry);
      default:
        return {
          id: entry.id,
          idempotency_key: entry.idempotency_key,
          status: "validation_error",
          reason: `Unhandled operation type '${entry.operation_type}'.`,
        };
    }
  }

  // -----------------------------------------------------------------------
  // Operation handlers
  // -----------------------------------------------------------------------

  private async handleSaleCreate(
    entry: SyncPushEntry,
  ): Promise<SyncPushResultEntry> {
    const payload = entry.payload as Record<string, unknown>;

    const sale = await this.saleRepo.create({
      user_id: (entry.actor_user_id as string) ?? "unknown",
      items: ((payload.items as unknown[]) ?? []).map((item: unknown) => {
        const i = item as Record<string, unknown>;
        return {
          product_id: (i.productId as string) ?? null,
          name: (i.name as string) ?? null,
          description: (i.description as string) ?? null,
          quantity: (i.quantity as number) ?? 0,
          unit_price: (i.unitPrice as string) ?? "0",
          subtotal: (i.subtotal as string) ?? "0",
          discount_amount: (i.discountAmount as string) ?? "0.00",
        };
      }),
      total: (payload.total as string) ?? "0",
      payment_methods: ((payload.payments as unknown[]) ?? []).map(
        (p: unknown) => {
          const pm = p as Record<string, unknown>;
          const rawMethod = (pm.method as string) ?? "cash";
          const method: PaymentMethod = VALID_PAYMENT_METHODS.has(rawMethod)
            ? (rawMethod as PaymentMethod)
            : "cash";
          return {
            method,
            amount: (pm.amount as string) ?? "0",
          };
        },
      ),
      invoice_status: "none",
    });

    await this.idempotency.recordResult(entry.idempotency_key, entry.payload, {
      status: "accepted",
      server_id: sale.id,
    });

    return {
      id: entry.id,
      idempotency_key: entry.idempotency_key,
      status: "accepted",
      server_id: sale.id,
    };
  }

  private async handleStockAdjust(
    entry: SyncPushEntry,
  ): Promise<SyncPushResultEntry> {
    const payload = entry.payload as Record<string, unknown>;
    const productId = payload.product_id as string;
    const quantity = payload.quantity as number;
    const reason = (payload.reason as string) ?? "manual";
    const referenceId = (payload.referenceId as string) ?? undefined;

    await this.inventoryRepo.adjustBalance(
      productId,
      quantity,
      STOCK_ADJUSTMENT,
      referenceId,
      reason,
    );

    await this.idempotency.recordResult(entry.idempotency_key, entry.payload, {
      status: "accepted",
    });

    return {
      id: entry.id,
      idempotency_key: entry.idempotency_key,
      status: "accepted",
    };
  }

  // -----------------------------------------------------------------------
  // Product handlers (Slice 5)
  // -----------------------------------------------------------------------

  private async handleProductCreate(
    entry: SyncPushEntry,
  ): Promise<SyncPushResultEntry> {
    const payload = entry.payload as Record<string, unknown>;

    const product = await this.productRepo.create({
      detalle: (payload.detalle as string) ?? "",
      costo_neto: (payload.costo_neto as string) ?? null,
      costo_final: (payload.costo_final as string) ?? null,
      iva: (payload.iva as string) ?? null,
      cambio_costo: (payload.cambio_costo as string) ?? "fixed",
      cambio_precio: (payload.cambio_precio as string) ?? "fixed",
      etiqueta: (payload.etiqueta as string) ?? "",
      facturable: (payload.facturable as boolean) ?? true,
      maneja_stock: (payload.maneja_stock as boolean) ?? true,
      codigos: (payload.codigos as string[]) ?? [],
    });

    await this.idempotency.recordResult(entry.idempotency_key, entry.payload, {
      status: "accepted",
      server_id: product.id,
    });

    return {
      id: entry.id,
      idempotency_key: entry.idempotency_key,
      status: "accepted",
      server_id: product.id,
    };
  }

  private async handleProductUpdate(
    entry: SyncPushEntry,
  ): Promise<SyncPushResultEntry> {
    const payload = entry.payload as Record<string, unknown>;

    // Server-authoritative conflict detection: when the client provides a
    // base_server_version, compare it against the current entity version.
    // If another client updated the entity, reject with conflict.
    if (entry.base_server_version) {
      const current = await this.productRepo.findById(entry.aggregate_id);
      if (current) {
        const currentVersion = current.updated_at instanceof Date
          ? current.updated_at.toISOString()
          : String(current.updated_at);
        if (currentVersion !== entry.base_server_version) {
          return {
            id: entry.id,
            idempotency_key: entry.idempotency_key,
            status: "conflict",
            server_version: currentVersion,
            reason: `Server version ${currentVersion} differs from base version ${entry.base_server_version}. Another client has already updated this product.`,
          };
        }
      }
    }

    const updateInput: ProductUpdateInput = {};
    if (payload.detalle !== undefined) updateInput.detalle = payload.detalle as string;
    if (payload.costo_neto !== undefined) updateInput.costo_neto = payload.costo_neto as string | null;
    if (payload.costo_final !== undefined) updateInput.costo_final = payload.costo_final as string | null;
    if (payload.iva !== undefined) updateInput.iva = payload.iva as string | null;
    if (payload.cambio_costo !== undefined) updateInput.cambio_costo = payload.cambio_costo as string;
    if (payload.cambio_precio !== undefined) updateInput.cambio_precio = payload.cambio_precio as string;
    if (payload.etiqueta !== undefined) updateInput.etiqueta = payload.etiqueta as string;
    if (payload.facturable !== undefined) updateInput.facturable = payload.facturable as boolean;
    if (payload.maneja_stock !== undefined) updateInput.maneja_stock = payload.maneja_stock as boolean;
    if (payload.codigos !== undefined) updateInput.codigos = payload.codigos as string[];

    // Fetch current product when price may change (needed for comparison and snapshot)
    let current = undefined as any;
    if (payload.costo_final !== undefined) {
      current = await this.productRepo.findById(entry.aggregate_id);
    }

    const priceChanged =
      payload.costo_final !== undefined &&
      payload.costo_final !== current?.costo_final;

    let product;
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
            detalle: current?.detalle ?? "",
            costo_final: current?.costo_final ?? null,
            codigos: current?.codigos ?? [],
          },
          payload.costo_final as string | null,
          runner,
        );
        return updated;
      });
    } else {
      product = await this.productRepo.update(entry.aggregate_id, updateInput);
    }

    const serverId = product?.id ?? entry.aggregate_id;

    await this.idempotency.recordResult(entry.idempotency_key, entry.payload, {
      status: "accepted",
      server_id: serverId,
    });

    return {
      id: entry.id,
      idempotency_key: entry.idempotency_key,
      status: "accepted",
      server_id: serverId,
    };
  }

  private async handleProductDelete(
    entry: SyncPushEntry,
  ): Promise<SyncPushResultEntry> {
    await this.productRepo.delete(entry.aggregate_id);

    // Record tombstone so pull can emit deletion changes.
    await this.tombstoneRepo.save({
      entity_id: entry.aggregate_id,
      aggregate_type: "product",
      operation_type: "product_delete",
    });

    await this.idempotency.recordResult(entry.idempotency_key, entry.payload, {
      status: "accepted",
    });

    return {
      id: entry.id,
      idempotency_key: entry.idempotency_key,
      status: "accepted",
    };
  }

  // -----------------------------------------------------------------------
  // Promotion handlers (Slice 5)
  // -----------------------------------------------------------------------

  private async handlePromotionCreate(
    entry: SyncPushEntry,
  ): Promise<SyncPushResultEntry> {
    const payload = entry.payload as Record<string, unknown>;

    const input: CreatePromotionInput = {
      name: (payload.name as string) ?? "",
      description: (payload.description as string) ?? null,
      scope: (payload.scope as CreatePromotionInput["scope"]) ?? "product",
      product_id: (payload.product_id as string) ?? null,
      type: (payload.type as CreatePromotionInput["type"]) ?? "percentage",
      discount_percent: (payload.discount_percent as number) ?? null,
      start_date: payload.start_date ? new Date(payload.start_date as string) : null,
      end_date: payload.end_date ? new Date(payload.end_date as string) : null,
      weekdays: (payload.weekdays as number[]) ?? null,
    };

    const promotion = await this.promotionRepo.create(input);

    await this.idempotency.recordResult(entry.idempotency_key, entry.payload, {
      status: "accepted",
      server_id: promotion.id,
    });

    return {
      id: entry.id,
      idempotency_key: entry.idempotency_key,
      status: "accepted",
      server_id: promotion.id,
    };
  }

  private async handlePromotionUpdate(
    entry: SyncPushEntry,
  ): Promise<SyncPushResultEntry> {
    const payload = entry.payload as Record<string, unknown>;

    // Server-authoritative conflict detection
    if (entry.base_server_version) {
      const current = await this.promotionRepo.findById(entry.aggregate_id);
      if (current) {
        const currentVersion = current.updated_at instanceof Date
          ? current.updated_at.toISOString()
          : String(current.updated_at);
        if (currentVersion !== entry.base_server_version) {
          return {
            id: entry.id,
            idempotency_key: entry.idempotency_key,
            status: "conflict",
            server_version: currentVersion,
            reason: `Server version ${currentVersion} differs from base version ${entry.base_server_version}. Another client has already updated this promotion.`,
          };
        }
      }
    }

    const updateInput: UpdatePromotionInput = {};
    if (payload.name !== undefined) updateInput.name = payload.name as string;
    if (payload.description !== undefined) updateInput.description = payload.description as string | null;
    if (payload.scope !== undefined) updateInput.scope = payload.scope as UpdatePromotionInput["scope"];
    if (payload.product_id !== undefined) updateInput.product_id = payload.product_id as string | null;
    if (payload.type !== undefined) updateInput.type = payload.type as UpdatePromotionInput["type"];
    if (payload.discount_percent !== undefined) updateInput.discount_percent = payload.discount_percent as number | null;
    if (payload.start_date !== undefined) updateInput.start_date = payload.start_date ? new Date(payload.start_date as string) : null;
    if (payload.end_date !== undefined) updateInput.end_date = payload.end_date ? new Date(payload.end_date as string) : null;
    if (payload.weekdays !== undefined) updateInput.weekdays = payload.weekdays as number[] | null;
    if (payload.enabled !== undefined) updateInput.enabled = payload.enabled as boolean;

    const promotion = await this.promotionRepo.update(entry.aggregate_id, updateInput);

    const serverId = promotion?.id ?? entry.aggregate_id;

    await this.idempotency.recordResult(entry.idempotency_key, entry.payload, {
      status: "accepted",
      server_id: serverId,
    });

    return {
      id: entry.id,
      idempotency_key: entry.idempotency_key,
      status: "accepted",
      server_id: serverId,
    };
  }

  private async handlePromotionDelete(
    entry: SyncPushEntry,
  ): Promise<SyncPushResultEntry> {
    await this.promotionRepo.delete(entry.aggregate_id);

    // Record tombstone so pull can emit deletion changes.
    await this.tombstoneRepo.save({
      entity_id: entry.aggregate_id,
      aggregate_type: "promotion",
      operation_type: "promotion_delete",
    });

    await this.idempotency.recordResult(entry.idempotency_key, entry.payload, {
      status: "accepted",
    });

    return {
      id: entry.id,
      idempotency_key: entry.idempotency_key,
      status: "accepted",
    };
  }

  // -----------------------------------------------------------------------
  // Provider purchase handlers (Slice 5)
  // -----------------------------------------------------------------------

  private async handleProviderPurchaseCreate(
    entry: SyncPushEntry,
  ): Promise<SyncPushResultEntry> {
    const payload = entry.payload as Record<string, unknown>;

    const purchase = await this.providerPurchaseRepo.create({
      provider_name: (payload.provider_name as string) ?? "",
      amount: (payload.amount as string) ?? "0",
      payment_method: (payload.payment_method as string) ?? undefined,
    });

    await this.idempotency.recordResult(entry.idempotency_key, entry.payload, {
      status: "accepted",
      server_id: purchase.id,
    });

    return {
      id: entry.id,
      idempotency_key: entry.idempotency_key,
      status: "accepted",
      server_id: purchase.id,
    };
  }

  private async handleProviderPurchaseUpdate(
    entry: SyncPushEntry,
  ): Promise<SyncPushResultEntry> {
    const payload = entry.payload as Record<string, unknown>;

    // Server-authoritative conflict detection
    if (entry.base_server_version) {
      const current = await this.providerPurchaseRepo.findById(entry.aggregate_id);
      if (current) {
        const currentVersion = current.updated_at instanceof Date
          ? current.updated_at.toISOString()
          : String(current.updated_at);
        if (currentVersion !== entry.base_server_version) {
          return {
            id: entry.id,
            idempotency_key: entry.idempotency_key,
            status: "conflict",
            server_version: currentVersion,
            reason: `Server version ${currentVersion} differs from base version ${entry.base_server_version}. Another client has already updated this provider purchase.`,
          };
        }
      }
    }

    const updateInput: UpdateProviderPurchaseInput = {};
    if (payload.provider_name !== undefined) updateInput.provider_name = payload.provider_name as string;
    if (payload.amount !== undefined) updateInput.amount = payload.amount as string;
    if (payload.payment_method !== undefined) updateInput.payment_method = payload.payment_method as string | null;

    const purchase = await this.providerPurchaseRepo.update(entry.aggregate_id, updateInput);

    const serverId = purchase?.id ?? entry.aggregate_id;

    await this.idempotency.recordResult(entry.idempotency_key, entry.payload, {
      status: "accepted",
      server_id: serverId,
    });

    return {
      id: entry.id,
      idempotency_key: entry.idempotency_key,
      status: "accepted",
      server_id: serverId,
    };
  }

  private async handleProviderPurchaseDelete(
    entry: SyncPushEntry,
  ): Promise<SyncPushResultEntry> {
    await this.providerPurchaseRepo.delete(entry.aggregate_id);

    // Record tombstone so pull can emit deletion changes.
    await this.tombstoneRepo.save({
      entity_id: entry.aggregate_id,
      aggregate_type: "provider_purchase",
      operation_type: "provider_purchase_delete",
    });

    await this.idempotency.recordResult(entry.idempotency_key, entry.payload, {
      status: "accepted",
    });

    return {
      id: entry.id,
      idempotency_key: entry.idempotency_key,
      status: "accepted",
    };
  }
}
