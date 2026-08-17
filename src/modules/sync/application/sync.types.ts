// ---------------------------------------------------------------------------
// Sync operation types — shared by push/pull use cases and controllers
// ---------------------------------------------------------------------------

/** Known outbox operation types. */
export type SyncOperationType =
  | "sale_create"
  | "stock_adjust"
  | "product_create"
  | "product_update"
  | "product_delete"
  | "promotion_create"
  | "promotion_update"
  | "promotion_delete"
  | "provider_purchase_create"
  | "provider_purchase_update"
  | "provider_purchase_delete";

/** Aggregate domain types that sync operations target. */
export type SyncAggregateType =
  | "sale"
  | "stock"
  | "product"
  | "promotion"
  | "provider_purchase";

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

export interface SyncPushEntry {
  /** Client-side outbox ID for idempotency and audit. */
  id: string;
  /** Stable idempotency key, e.g. `{installationId}:{outboxId}`. */
  idempotency_key: string;
  operation_type: SyncOperationType;
  aggregate_type: SyncAggregateType;
  aggregate_id: string;
  /** Raw JSON payload from the desktop outbox entry. */
  payload: unknown;
  /** Server version observed when the local change was made, when applicable. */
  base_server_version?: string | null;
  /** User ID of the actor who created the operation. */
  actor_user_id?: string | null;
  /** When the operation was created on the client. */
  created_at: string;
}

export interface SyncPushRequest {
  entries: SyncPushEntry[];
}

export type SyncOperationStatus =
  | "accepted"
  | "duplicate"
  | "conflict"
  | "validation_error"
  | "auth_blocked"
  | "transient_error"
  | "blocked"
  | "pending";

export interface SyncPushResultEntry {
  /** Matches the client outbox entry `id`. */
  id: string;
  idempotency_key: string;
  status: SyncOperationStatus;
  /** Server-assigned ID for locally created records, when applicable. */
  server_id?: string | null;
  /** Server version after the operation was applied. */
  server_version?: string | null;
  /** User-visible reason when status is not `accepted` or `duplicate`. */
  reason?: string | null;
}

export interface SyncPushResponse {
  results: SyncPushResultEntry[];
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

export interface SyncPullQuery {
  /** Monotonic server cursor from the last successful pull or bootstrap. */
  cursor?: string;
  /** Max entries to return in one batch. */
  limit?: number;
}

export interface SyncPullChange {
  /** Server-assigned ID. */
  id: string;
  aggregate_type: SyncAggregateType;
  operation_type: SyncOperationType;
  /** Monotonic server version for this change. */
  server_version: string;
  /** When the change was applied on the server. */
  server_applied_at: string;
  /** The payload that should be applied locally. */
  payload: unknown;
  /** `true` when the entity was soft-deleted (tombstone). */
  deleted?: boolean;
}

export interface SyncPullResponse {
  changes: SyncPullChange[];
  /** The latest server cursor after this response. */
  cursor: string;
  /** `true` when there are more pages to fetch. */
  has_more: boolean;
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

export interface IdempotencyRecord {
  idempotency_key: string;
  operation_hash: string;
  status: SyncOperationStatus;
  server_id?: string | null;
  server_version?: string | null;
  reason?: string | null;
  created_at: Date;
}

// ---------------------------------------------------------------------------
// Domain Payload, Guard & Port Re-exports
// ---------------------------------------------------------------------------

export * from '../domain/sync-payloads';
export * from '../domain/sync-payload.guards';
export * from './ports/sync-operation-handler.port';


