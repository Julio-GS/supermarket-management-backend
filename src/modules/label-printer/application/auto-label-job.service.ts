import { Injectable } from "@nestjs/common";
import { PrintJobRepositoryPort } from "./print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";
import { QueryRunner } from "typeorm";

export interface ProductForLabel {
  id: string;
  detalle: string;
  costo_final: string | null;
  codigos: string[];
}

@Injectable()
export class AutoLabelJobService {
  constructor(private readonly repo: PrintJobRepositoryPort) {}

  /**
   * Handles the side effect of a product's final sale price changing.
   *
   * - If the new price is null or equals the product's current costo_final, does nothing.
   * - Otherwise, acquires a PostgreSQL transaction advisory lock for the product,
   *   cancels all pending/claimable auto jobs for this product by marking them
   *   as superseded, then creates a new pending auto job with the new price snapshot.
   *
   * Concurrency safety:
   * - Advisory lock serializes competing changes for the same product within the
   *   same database connection pool.
   * - The partial unique index idx_label_print_jobs_auto_one_active prevents the
   *   race where two transactions start without a lock.
   * - With advisory serialization, unexpected unique violations propagate and
   *   roll back the transaction rather than being caught and re-queried.
   *
   * The caller MUST provide a live QueryRunner. The advisory lock, supersede,
   * and create operations all use it.
   */
  async onProductPriceChanged(
    product: ProductForLabel,
    newFinalPrice: string | null,
    runner: QueryRunner,
  ): Promise<PrintJob | null> {
    if (!runner) {
      throw new Error("runner is required for onProductPriceChanged");
    }

    // Unchanged or cleared price: no label needed
    if (newFinalPrice === null) return null;
    if (product.costo_final === newFinalPrice) return null;

    // Serialize concurrent auto-label changes for the same product.
    // pg_advisory_xact_lock is transaction-scoped: released on commit/rollback.
    await runner.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`auto_label:${product.id}`],
    );

    // Cancel stale pending/failed auto jobs before creating the new one.
    // Marks them as 'superseded' — a terminal non-claimable status.
    await this.repo.cancelPendingByProduct(product.id, runner);

    const sku = product.codigos.length > 0 ? product.codigos[0] : "";

    return await this.repo.create(
      {
        product_id: product.id,
        sku,
        product_name: product.detalle,
        sale_price: newFinalPrice,
        source: "auto",
      },
      runner,
    );
  }
}
