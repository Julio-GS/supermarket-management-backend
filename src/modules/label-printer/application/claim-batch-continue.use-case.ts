import { Injectable } from "@nestjs/common";
import {
  PrintJobRepositoryPort,
  ClaimBatchContinuingAfter,
} from "./print-job.repository.port";
import {
  ClaimBatchCursorService,
  ClaimBatchCursorPayloadV1,
} from "./claim-batch-cursor.service";
import { PrintJob } from "../domain/print-job.entity";
import { ConflictError, ValidationError } from "../../../shared/errors/domain.error";

const DEFAULT_LIMIT = 45;
const MIN_LIMIT = 1;
const MAX_LIMIT = 45;
const MIN_LEASE_SECONDS = 1;
const MAX_LEASE_SECONDS = 300;

export interface ClaimBatchContinueInput {
  installation: string;
  cursor?: string | null;
  limit?: number;
  lease_seconds?: number;
}

export interface ClaimBatchContinueResult {
  jobs: PrintJob[];
  next_cursor: string | null;
  has_more: boolean;
}

@Injectable()
export class ClaimBatchContinueUseCase {
  constructor(
    private readonly repo: PrintJobRepositoryPort,
    private readonly cursorService: ClaimBatchCursorService,
  ) {}

  async execute(input: ClaimBatchContinueInput): Promise<ClaimBatchContinueResult> {
    const limit = input.limit ?? DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < MIN_LIMIT || limit > MAX_LIMIT) {
      throw new ValidationError(
        `limit must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}`,
      );
    }

    const installation = input.installation ?? "";
    if (installation.trim().length === 0) {
      throw new ValidationError("installation is required");
    }

    const isContinuation = input.cursor != null;

    let leaseDeadline: Date;
    let after: ClaimBatchContinuingAfter | null = null;

    if (isContinuation) {
      if (input.lease_seconds != null) {
        throw new ValidationError("lease_seconds must not be provided on continuation");
      }

      const payload = this.cursorService.verify(input.cursor as string);
      if (payload.installation !== installation) {
        throw new ValidationError("cursor installation mismatch");
      }
      if (Date.now() >= payload.deadline_ms) {
        throw new ConflictError("flow lease expired");
      }

      leaseDeadline = new Date(payload.deadline_ms);
      after = {
        created_at: new Date(payload.last_created_at),
        id: payload.last_id,
      };
    } else {
      const leaseSeconds = input.lease_seconds;
      if (
        !Number.isInteger(leaseSeconds) ||
        leaseSeconds! < MIN_LEASE_SECONDS ||
        leaseSeconds! > MAX_LEASE_SECONDS
      ) {
        throw new ValidationError(
          `lease_seconds must be an integer between ${MIN_LEASE_SECONDS} and ${MAX_LEASE_SECONDS}`,
        );
      }
      leaseDeadline = new Date(Date.now() + leaseSeconds! * 1000);
    }

    const result = await this.repo.claimBatchContinuing({
      installation,
      leaseExpiresAt: leaseDeadline,
      limit,
      after,
    });

    if (result.hasMore && result.jobs.length === 0) {
      throw new ConflictError("claim continuation cursor did not advance");
    }

    let next_cursor: string | null = null;
    if (result.hasMore && result.jobs.length > 0) {
      const last = result.jobs[result.jobs.length - 1];
      const payload: ClaimBatchCursorPayloadV1 = {
        v: 1,
        installation,
        deadline_ms: leaseDeadline.getTime(),
        last_created_at: last.created_at.toISOString(),
        last_id: last.id,
      };
      next_cursor = this.cursorService.sign(payload);
    }

    return {
      jobs: result.jobs,
      next_cursor,
      has_more: result.hasMore,
    };
  }
}
