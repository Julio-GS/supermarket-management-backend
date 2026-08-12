import { Injectable } from "@nestjs/common";
import {
  ProductRepositoryPort,
  ProductCreateInput,
} from "./product.repository.port";
import { Product } from "../domain/product.entity";
import { ConflictError, ValidationError } from "../../../shared/errors/domain.error";
import { ReadCachePort } from "../../../shared/cache/read-cache.port";
import { PRODUCT_READ_CACHE_POLICY } from "../../../shared/cache/cache-policy";
import { containsReservedCode } from "../domain/special-product-codes";
import { InventoryRepositoryPort } from "../../inventory/application/inventory.repository.port";
import { TransactionRunnerPort } from "../../../shared/database/transaction-runner.port";
import { ProductCreateIdempotencyRepositoryPort } from "./product-create-idempotency.repository.port";
import { ProductCreatePayloadCanonicalizer } from "./product-create-payload-canonicalizer";
import { PrintJobRepositoryPort } from "../../label-printer/application/print-job.repository.port";
import { QueryRunner } from "typeorm";

const UNIQUE_VIOLATION_CODE = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as Record<string, unknown>).code === UNIQUE_VIOLATION_CODE
  );
}

@Injectable()
export class CreateProductUseCase {
  constructor(
    private readonly products: ProductRepositoryPort,
    private readonly cache: ReadCachePort,
    private readonly inventory: InventoryRepositoryPort,
    private readonly transactionRunner: TransactionRunnerPort,
    private readonly idempotencyRepo: ProductCreateIdempotencyRepositoryPort,
    private readonly printJobRepo: PrintJobRepositoryPort,
    private readonly canonicalizer: ProductCreatePayloadCanonicalizer,
  ) {}

  async execute(
    input: ProductCreateInput,
    idempotencyKey: string,
  ): Promise<Record<string, unknown>> {
    // Validate idempotency key
    if (!idempotencyKey || !idempotencyKey.trim()) {
      throw new ValidationError("Idempotency-Key is required");
    }
    const key = idempotencyKey.trim();

    // Reserved code check before any persistence
    if (input.codigos && containsReservedCode(input.codigos)) {
      throw new ValidationError(
        "Cannot create a product with reserved special codes (1-9)",
      );
    }

    // Canonicalize input
    const { version, hash } = this.canonicalizer.canonicalize(input);

    let result: Record<string, unknown>;
    try {
      result = await this.transactionRunner.run(async (runner) => {
        return this.createInTransaction(runner, input, key, version, hash);
      });
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        // Race: another transaction committed the same key first.
        // Rollback happened; retry via durable replay/conflict in a new tx.
        return this.retryReplay(key, version, hash);
      }
      throw err;
    }

    // Invalidate cache only after successful commit
    await this.cache.deleteByPrefix(PRODUCT_READ_CACHE_POLICY.prefix);
    return result;
  }

  private async createInTransaction(
    runner: QueryRunner,
    input: ProductCreateInput,
    key: string,
    version: number,
    hash: string,
  ): Promise<Record<string, unknown>> {
    // Acquire transaction-scoped advisory lock to serialize same-key requests
    await runner.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`product_create:${key}`],
    );

    // Check existing idempotency record inside transaction
    const existing = await this.idempotencyRepo.findByKey(key, runner);
    if (existing) {
      if (
        existing.payload_version !== version ||
        existing.payload_hash !== hash
      ) {
        throw new ConflictError(
          "Idempotency conflict: different payload for same key",
        );
      }
      // Replay: return stored response body
      return existing.response_body;
    }

    // Barcode duplicate check inside transaction, bound to runner
    if (input.codigos && input.codigos.length > 0) {
      const hasDuplicates = await this.products.existsAnyBarcode(
        input.codigos,
        undefined,
        runner,
      );
      if (hasDuplicates) {
        throw new ConflictError("One or more barcodes already exist");
      }
    }

    // Create product
    const product = await this.products.create(input, runner);

    // Optional stock balance
    if (product.maneja_stock) {
      await this.inventory.createBalance(product.id, 0, runner);
    }

    // Optional label job
    let labelJobId: string | null = null;
    let labelJobSnapshot: Record<string, unknown> | null = null;

    if (product.costo_final !== null && product.costo_final !== undefined) {
      const sku = product.codigos.length > 0 ? product.codigos[0] : "";
      const job = await this.printJobRepo.create(
        {
          product_id: product.id,
          sku,
          product_name: product.detalle,
          sale_price: product.costo_final,
          source: "auto",
        },
        runner,
      );
      labelJobId = job.id;
      labelJobSnapshot = {
        id: job.id,
        product_id: job.product_id,
        sku: job.sku,
        product_name: job.product_name,
        sale_price: job.sale_price,
        status: "pending",
        source: "auto",
        quantity: 1,
        created_at: job.created_at,
        updated_at: job.updated_at,
      };
    }

    // Build response
    const responseBody = this.buildResponse(product, labelJobSnapshot);

    // Persist idempotency record — unique violation here triggers retry
    await this.idempotencyRepo.create(
      {
        idempotencyKey: key,
        payloadVersion: version,
        payloadHash: hash,
        productId: product.id,
        labelJobId,
        responseBody,
      },
      runner,
    );

    return responseBody;
  }

  /**
   * After a unique-violation rollback, open a new transaction to replay
   * or conflict against the committed idempotency row.
   */
  private async retryReplay(
    key: string,
    version: number,
    hash: string,
  ): Promise<Record<string, unknown>> {
    return this.transactionRunner.run(async (runner) => {
      await runner.query(
        `SELECT pg_advisory_xact_lock(hashtext($1))`,
        [`product_create:${key}`],
      );

      const existing = await this.idempotencyRepo.findByKey(key, runner);
      if (!existing) {
        throw new ConflictError(
          "Idempotency record not found after unique violation; retry the request",
        );
      }

      if (
        existing.payload_version !== version ||
        existing.payload_hash !== hash
      ) {
        throw new ConflictError(
          "Idempotency conflict: different payload for same key",
        );
      }

      return existing.response_body;
    });
  }

  private buildResponse(
    product: Product,
    labelJob: Record<string, unknown> | null,
  ): Record<string, unknown> {
    return {
      id: product.id,
      detalle: product.detalle,
      costo_neto: product.costo_neto,
      costo_final: product.costo_final,
      iva: product.iva,
      cambio_costo: product.cambio_costo,
      cambio_precio: product.cambio_precio,
      etiqueta: product.etiqueta,
      facturable: product.facturable,
      maneja_stock: product.maneja_stock,
      codigos: product.codigos,
      pricing_mode: product.pricing_mode,
      is_protected: product.is_protected,
      stock_actual: product.maneja_stock ? 0 : null,
      created_at: product.created_at,
      updated_at: product.updated_at,
      label_status: labelJob ? "pending" : "not_required",
      label_job: labelJob,
    };
  }
}
