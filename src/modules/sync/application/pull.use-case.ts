import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProductRepositoryPort } from "../../products/application/product.repository.port";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { PromotionRepositoryPort } from "../../promotions/application/promotion.repository.port";
import { ProviderPurchaseRepositoryPort } from "../../reports/application/provider-purchase.repository.port";
import { SyncTombstoneEntity } from "../infrastructure/sync-tombstone.entity";
import type {
  SyncPullQuery,
  SyncPullResponse,
  SyncPullChange,
} from "./sync.types";

const CURSOR_SEPARATOR = "|";
const DEFAULT_CURSOR = "1970-01-01T00:00:00.000Z";
const DEFAULT_LIMIT = 100;

// ---------------------------------------------------------------------------
// Cursor helpers
// ---------------------------------------------------------------------------

interface ParsedCursor {
  timestamp: Date;
  lastId: string | null;
}

function parseCursor(cursor: string): ParsedCursor {
  const sepIdx = cursor.indexOf(CURSOR_SEPARATOR);
  if (sepIdx === -1) {
    return { timestamp: new Date(cursor), lastId: null };
  }
  return {
    timestamp: new Date(cursor.slice(0, sepIdx)),
    lastId: cursor.slice(sepIdx + 1),
  };
}

function encodeCursor(timestamp: string, lastId?: string): string {
  if (!lastId) return timestamp;
  return `${timestamp}${CURSOR_SEPARATOR}${lastId}`;
}

/**
 * Determines whether a record at `updatedAt` with `id` should be included
 * given the parsed cursor.
 *
 * When the cursor has no tie-breaker ID (initial pull or no prior page
 * boundary), the check is `updatedAt >= cursorTimestamp`.
 *
 * When the cursor has a tie-breaker ID (a previous page was cut at a
 * record with this timestamp+id), the check is:
 *   `updatedAt > cursorTimestamp`
 *   OR (`updatedAt == cursorTimestamp` AND `id > cursorLastId`)
 *
 * This guarantees forward progress even when many records share the same
 * `updatedAt` timestamp.
 */
function shouldInclude(
  updatedAt: Date,
  id: string,
  cursor: ParsedCursor,
): boolean {
  const updatedTime = updatedAt.getTime();
  const cursorTime = cursor.timestamp.getTime();

  if (cursor.lastId === null) {
    return updatedTime >= cursorTime;
  }

  if (updatedTime > cursorTime) return true;
  if (updatedTime === cursorTime && id > cursor.lastId) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Use case
// ---------------------------------------------------------------------------

/**
 * Build a pull response of changes since a composite monotonic cursor.
 *
 * The cursor is an opaque string that the server parses internally.
 * When a page boundary cuts through same-timestamp records the cursor
 * includes both the timestamp and the last returned change ID so the next
 * pull can skip already-returned records deterministically.
 *
 * In this first slice the pull surface scans entity `updated_at` timestamps
 * for products, stock balances, promotions, and provider purchases.
 * Later slices may replace this with a dedicated change-tracking table.
 */
@Injectable()
export class PullUseCase {
  constructor(
    private readonly productRepo: ProductRepositoryPort,
    private readonly inventoryRepo: InventoryRepositoryPort,
    private readonly promotionRepo: PromotionRepositoryPort,
    private readonly providerPurchaseRepo: ProviderPurchaseRepositoryPort,
    @InjectRepository(SyncTombstoneEntity)
    private readonly tombstoneRepo: Repository<SyncTombstoneEntity>,
  ) {}

  async execute(query: SyncPullQuery): Promise<SyncPullResponse> {
    const rawCursor = query.cursor ?? DEFAULT_CURSOR;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const parsed = parseCursor(rawCursor);

    const changes: SyncPullChange[] = [];

    // -------------------------------------------------------------------
    // Products
    // -------------------------------------------------------------------
    const products = await this.productRepo.findAll();
    for (const p of products) {
      if (shouldInclude(p.updated_at, p.id, parsed)) {
        changes.push({
          id: p.id,
          aggregate_type: "product",
          operation_type: "product_update",
          server_version: p.updated_at.toISOString(),
          server_applied_at: p.updated_at.toISOString(),
          payload: {
            id: p.id,
            detalle: p.detalle,
            costo_neto: p.costo_neto,
            costo_final: p.costo_final,
            iva: p.iva,
            cambio_costo: p.cambio_costo,
            cambio_precio: p.cambio_precio,
            etiqueta: p.etiqueta,
            facturable: p.facturable,
            maneja_stock: p.maneja_stock,
            codigos: p.codigos,
            pricing_mode: p.pricing_mode,
            is_protected: p.is_protected,
            updated_at: p.updated_at.toISOString(),
          },
        });
      }
    }

    // -------------------------------------------------------------------
    // Stock balances
    // -------------------------------------------------------------------
    const balances = await this.inventoryRepo.findAllBalances();
    for (const b of balances) {
      if (shouldInclude(b.updated_at, b.product_id, parsed)) {
        changes.push({
          id: b.product_id,
          aggregate_type: "stock",
          operation_type: "stock_adjust",
          server_version: b.updated_at.toISOString(),
          server_applied_at: b.updated_at.toISOString(),
          payload: {
            product_id: b.product_id,
            stock_actual: b.stock_actual,
            updated_at: b.updated_at.toISOString(),
          },
        });
      }
    }

    // -------------------------------------------------------------------
    // Promotions
    // -------------------------------------------------------------------
    const promotions = await this.promotionRepo.findAll();
    for (const pr of promotions) {
      if (shouldInclude(pr.updated_at, pr.id, parsed)) {
        changes.push({
          id: pr.id,
          aggregate_type: "promotion",
          operation_type: "promotion_update",
          server_version: pr.updated_at.toISOString(),
          server_applied_at: pr.updated_at.toISOString(),
          payload: {
            id: pr.id,
            name: pr.name,
            description: pr.description,
            scope: pr.scope,
            product_id: pr.product_id,
            type: pr.type,
            discount_percent: pr.discount_percent,
            start_date: pr.start_date?.toISOString?.() ?? pr.start_date ?? null,
            end_date: pr.end_date?.toISOString?.() ?? pr.end_date ?? null,
            weekdays: pr.weekdays,
            enabled: pr.enabled,
            updated_at: pr.updated_at.toISOString(),
          },
        });
      }
    }

    // -------------------------------------------------------------------
    // Provider purchases
    // -------------------------------------------------------------------
    const purchases = await this.providerPurchaseRepo.findAll();
    for (const pp of purchases) {
      if (shouldInclude(pp.updated_at, pp.id, parsed)) {
        changes.push({
          id: pp.id,
          aggregate_type: "provider_purchase",
          operation_type: "provider_purchase_update",
          server_version: pp.updated_at.toISOString(),
          server_applied_at: pp.updated_at.toISOString(),
          payload: {
            id: pp.id,
            provider_name: pp.provider_name,
            amount: pp.amount,
            payment_method: pp.payment_method,
            updated_at: pp.updated_at.toISOString(),
          },
        });
      }
    }

    // -------------------------------------------------------------------
    // Tombstones — emit deletion changes for physically deleted entities
    // -------------------------------------------------------------------
    const tombstoneWhere = parsed.lastId
      ? `(deleted_at > @cursorTime OR (deleted_at = @cursorTime AND entity_id > @lastId))`
      : `deleted_at >= @cursorTime`;

    const tombstones = await this.tombstoneRepo
      .createQueryBuilder("t")
      .where(tombstoneWhere, {
        cursorTime: parsed.timestamp.toISOString(),
        lastId: parsed.lastId,
      })
      .orderBy("t.deleted_at", "ASC")
      .addOrderBy("t.entity_id", "ASC")
      .getMany();

    for (const t of tombstones) {
      let operationType: string;
      switch (t.aggregate_type) {
        case "product":
          operationType = "product_delete";
          break;
        case "promotion":
          operationType = "promotion_delete";
          break;
        case "provider_purchase":
          operationType = "provider_purchase_delete";
          break;
        default:
          continue;
      }

      changes.push({
        id: t.entity_id,
        aggregate_type: t.aggregate_type as SyncPullChange["aggregate_type"],
        operation_type: operationType as SyncPullChange["operation_type"],
        server_version: t.deleted_at.toISOString(),
        server_applied_at: t.deleted_at.toISOString(),
        payload: {},
        deleted: true,
      });
    }

    // -------------------------------------------------------------------
    // Cursor advancement & pagination
    // -------------------------------------------------------------------
    // Sort by (server_applied_at, id) so same-timestamp records have a
    // deterministic ordering and the composite cursor can reliably skip
    // already-returned records on the next pull.
    changes.sort((a, b) => {
      const timeDiff =
        new Date(a.server_applied_at).getTime() -
        new Date(b.server_applied_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });

    const hasMore = changes.length > limit;
    const page = changes.slice(0, limit);

    // When has_more=true the cursor MUST include both the last returned
    // change's timestamp AND its ID so the next pull can skip past
    // already-delivered same-timestamp records.
    // When has_more=false the cursor advances to now because all
    // changes up to the current time have been delivered.
    const newCursor =
      hasMore && page.length > 0
        ? encodeCursor(
            page[page.length - 1].server_applied_at,
            page[page.length - 1].id,
          )
        : new Date().toISOString();

    return {
      changes: page,
      cursor: newCursor,
      has_more: hasMore,
    };
  }
}
