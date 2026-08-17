import { PrintJob } from "../domain/print-job.entity";
import { QueryRunner } from "typeorm";

export interface CreatePrintJobInput {
  product_id: string;
  sku: string;
  product_name: string;
  sale_price: string;
  idempotency_key?: string;
  source?: string | null;
}

export interface ClaimBatchContinuingAfter {
  created_at: Date;
  id: string;
}

export interface ClaimBatchContinuingResult {
  jobs: PrintJob[];
  hasMore: boolean;
}

export abstract class PrintJobRepositoryPort {
  abstract create(input: CreatePrintJobInput, runner?: QueryRunner): Promise<PrintJob>;

  /** Look up a print job by its idempotency key. Returns null when no job exists for that key. */
  abstract findByIdempotencyKey(key: string): Promise<PrintJob | null>;

  /** Look up a print job by its primary id. */
  abstract findById(id: string): Promise<PrintJob | null>;

  /** Returns pending jobs, plus failed jobs eligible for retry, ordered by created_at ASC. */
  abstract findPending(): Promise<PrintJob[]>;

  /**
   * Atomically claim the oldest claimable job for an installation.
   * Candidates: status = 'pending', 'failed', or 'claimed' with expired lease.
   * Superseded jobs are excluded — they are terminal and non-claimable.
   * Uses UPDATE ... RETURNING * so the caller receives the exact row that was locked.
   * Returns the claimed job or null if none available.
   */
  abstract claimNext(installation: string, leaseMs: number): Promise<PrintJob | null>;

  /**
   * Atomically claim up to `limit` distinct claimable jobs in a single CTE/UPDATE.
   * Same candidate pool as claimNext: pending, failed, or claimed with expired lease.
   * Superseded jobs are excluded.
   * Uses a single CTE with FOR UPDATE SKIP LOCKED for all-or-nothing atomicity.
   * Results are sorted by created_at ASC for deterministic ordering.
   * Returns the claimed jobs array (empty when none available).
   */
  abstract claimBatch(installation: string, leaseMs: number, limit: number): Promise<PrintJob[]>;

  /**
   * Atomically claim a page of jobs for cursor-based continuation.
   * Locks up to limit + 1 candidates FOR UPDATE SKIP LOCKED, claims only the
   * first `limit`, never the lookahead, and returns sorted claimed jobs plus
   * whether more rows may exist. `leaseExpiresAt` is the immutable flow
   * deadline and must be applied verbatim to every claimed row.
   */
  abstract claimBatchContinuing(input: {
    installation: string;
    leaseExpiresAt: Date;
    limit: number;
    after?: ClaimBatchContinuingAfter | null;
  }): Promise<ClaimBatchContinuingResult>;

  /**
   * Complete a claimed job. Must be the same installation and the lease must not be expired.
   * Returns null when the job is not found, not claimed by this installation,
   * or the lease has expired.
   */
  abstract complete(jobId: string, installation: string): Promise<PrintJob | null>;

  /**
   * Mark a claimed job as failed with a reason. Must be the same installation and
   * the lease must not be expired. Returns null when the preconditions are not met.
   */
  abstract fail(jobId: string, installation: string, reason: string): Promise<PrintJob | null>;

  /**
   * Atomically transition a claimed job to terminal `blocked_for_review` with an
   * audit trail. Requires the same installation and a valid (unexpired) lease.
   * Returns null when the preconditions are not met.
   */
  abstract block(jobId: string, installation: string, reason: string): Promise<PrintJob | null>;

  /** Reclaim jobs whose lease has expired, making them claimable again. */
  abstract expireLeases(): Promise<number>;

  /**
   * Cancel all pending/claimable auto-source jobs for a product.
   * Sets status to 'superseded' with fail_reason 'superseded'.
   * Supersedes pending, failed, and auto claimed jobs whose lease has expired.
   * Never touches claimed (with valid lease), completed, superseded, or manual jobs.
   * Returns the number of jobs superseded.
   */
  abstract cancelPendingByProduct(
    productId: string,
    runner?: QueryRunner,
  ): Promise<number>;
}
