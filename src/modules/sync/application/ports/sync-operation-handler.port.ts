import { SyncOperationType } from '../sync.types';
import { EntryForOperation } from '../../domain/sync-payloads';

export type SyncHandlerAcceptedResult = {
  status: 'accepted';
  server_id?: string | null;
  server_version?: string | null;
  reason?: string | null;
};

export type SyncHandlerConflictResult = {
  status: 'conflict';
  server_id?: string | null;
  server_version?: string | null;
  reason: string;
};

export type SyncHandlerResult =
  | SyncHandlerAcceptedResult
  | SyncHandlerConflictResult;

export interface SyncOperationHandler<
  TOperation extends SyncOperationType = SyncOperationType,
> {
  readonly supportedOperations: ReadonlySet<TOperation>;
  handle(entry: EntryForOperation<TOperation>): Promise<SyncHandlerResult>;
}

export const SYNC_OPERATION_HANDLERS = Symbol('SYNC_OPERATION_HANDLERS');

