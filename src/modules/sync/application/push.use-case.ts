import { Inject, Injectable } from "@nestjs/common";
import { IdempotencyService } from "./idempotency.service";
import {
  SYNC_OPERATION_HANDLERS,
  SyncOperationHandler,
} from "./ports/sync-operation-handler.port";
import { validateTypedSyncPushEntry } from "../domain/sync-payload.guards";
import type {
  SyncPushEntry,
  SyncPushRequest,
  SyncPushResponse,
  SyncPushResultEntry,
  SyncOperationType,
  SyncOperationStatus,
} from "./sync.types";

/**
 * Process a batch of outbox entries pushed by a desktop client.
 *
 * Lean orchestrator: delegates per-aggregate business logic to dedicated
 * sync operation handlers while maintaining:
 * 1. Sequential batch iteration
 * 2. Idempotency duplicate & violation checking
 * 3. Type guard payload validation (pure, zero-mutation)
 * 4. Handler dispatch by operation_type
 * 5. Idempotency result recording on accepted success
 * 6. Unexpected error trapping with cascade blocking (all subsequent entries become `blocked`)
 */
@Injectable()
export class PushUseCase {
  private readonly handlersByOperation: Map<
    SyncOperationType,
    SyncOperationHandler
  >;

  constructor(
    private readonly idempotency: IdempotencyService,
    @Inject(SYNC_OPERATION_HANDLERS)
    handlers: SyncOperationHandler[],
  ) {
    this.handlersByOperation = this.buildHandlerMap(handlers ?? []);
  }

  private buildHandlerMap(
    handlers: SyncOperationHandler[],
  ): Map<SyncOperationType, SyncOperationHandler> {
    const map = new Map<SyncOperationType, SyncOperationHandler>();
    for (const handler of handlers) {
      for (const op of handler.supportedOperations) {
        if (map.has(op)) {
          throw new Error(
            `Duplicate sync operation handler registered for operation '${op}'.`,
          );
        }
        map.set(op, handler);
      }
    }
    return map;
  }

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

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

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
    // 1 — Duplicate check (same key + same raw payload)
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

    // 2 — Idempotency violation check (same key, different raw payload)
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

    // 3 — Runtime type guard and entry validation (pure, zero-mutation)
    const validation = validateTypedSyncPushEntry(entry);
    if (!validation.ok) {
      return {
        id: entry.id,
        idempotency_key: entry.idempotency_key,
        status: "validation_error",
        reason: validation.reason,
      };
    }

    // 4 — Resolve operation handler
    const handler = this.handlersByOperation.get(entry.operation_type);
    if (!handler) {
      return {
        id: entry.id,
        idempotency_key: entry.idempotency_key,
        status: "validation_error",
        reason: `Operation type '${entry.operation_type}' is not supported.`,
      };
    }

    // 5 — Dispatch to handler & trap unexpected errors
    try {
      const handlerResult = await handler.handle(validation.entry as any);

      if (handlerResult.status === "conflict") {
        return {
          id: entry.id,
          idempotency_key: entry.idempotency_key,
          status: "conflict",
          server_id: handlerResult.server_id ?? null,
          server_version: handlerResult.server_version ?? null,
          reason: handlerResult.reason,
        };
      }

      await this.idempotency.recordResult(
        entry.idempotency_key,
        entry.payload,
        {
          status: "accepted",
          server_id: handlerResult.server_id ?? null,
          server_version: handlerResult.server_version ?? null,
          reason: handlerResult.reason ?? null,
        },
      );

      return {
        id: entry.id,
        idempotency_key: entry.idempotency_key,
        status: "accepted",
        server_id: handlerResult.server_id ?? null,
        server_version: handlerResult.server_version ?? null,
        reason: handlerResult.reason ?? null,
      };
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
}
