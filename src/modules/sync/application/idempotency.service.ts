import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { createHash } from "node:crypto";
import { IdempotencyRecordEntity } from "../infrastructure/idempotency-record.entity";
import type { SyncOperationStatus } from "./sync.types";

export interface IdempotencyResult {
  status: SyncOperationStatus;
  server_id?: string | null;
  server_version?: string | null;
  reason?: string | null;
}

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyRecordEntity)
    private readonly repo: Repository<IdempotencyRecordEntity>,
  ) {}

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Check whether an idempotency key has already been processed with the
   * **same** payload.  Returns `true` when the key exists AND the hash
   * matches — this is a safe duplicate.
   */
  async hasBeenProcessed(
    idempotencyKey: string,
    payload: unknown,
  ): Promise<boolean> {
    const hash = this.hashPayload(payload);
    const existing = await this.repo.findOne({
      where: { idempotency_key: idempotencyKey },
    });
    if (!existing) return false;
    return existing.operation_hash === hash;
  }

  /**
   * Throw when a key already exists with a **different** payload hash.
   * This is a protocol-level violation — the same key must never be reused
   * for a different payload.
   */
  async checkIdempotencyViolation(
    idempotencyKey: string,
    payload: unknown,
  ): Promise<void> {
    const hash = this.hashPayload(payload);
    const existing = await this.repo.findOne({
      where: { idempotency_key: idempotencyKey },
    });
    if (!existing) return; // first time — OK

    if (existing.operation_hash !== hash) {
      throw new Error(
        `Idempotency violation: key '${idempotencyKey}' was previously used ` +
          `with a different payload hash. Expected ${existing.operation_hash}, ` +
          `got ${hash}.`,
      );
    }
    // same hash → duplicate, not a violation
  }

  /**
   * Persist the result of processing an operation so future duplicates
   * can return the original response without re-executing.
   */
  async recordResult(
    idempotencyKey: string,
    payload: unknown,
    result: IdempotencyResult,
  ): Promise<void> {
    await this.repo.save({
      idempotency_key: idempotencyKey,
      operation_hash: this.hashPayload(payload),
      status: result.status,
      server_id: result.server_id ?? null,
      server_version: result.server_version ?? null,
      reason: result.reason ?? null,
    });
  }

  /**
   * Return the previously stored result for a duplicate key, or `null` when
   * no record exists.
   */
  async findExistingResult(
    idempotencyKey: string,
  ): Promise<IdempotencyResult | null> {
    const record = await this.repo.findOne({
      where: { idempotency_key: idempotencyKey },
    });
    if (!record) return null;
    return {
      status: record.status as SyncOperationStatus,
      server_id: record.server_id,
      server_version: record.server_version,
      reason: record.reason,
    };
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  private hashPayload(payload: unknown): string {
    return createHash("sha256")
      .update(JSON.stringify(payload))
      .digest("hex");
  }
}
