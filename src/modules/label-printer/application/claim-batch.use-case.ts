import { Injectable } from "@nestjs/common";
import { PrintJobRepositoryPort } from "./print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";
import { ValidationError } from "../../../shared/errors/domain.error";

const DEFAULT_LEASE_MS = 30_000; // 30 seconds
const MIN_LEASE_MS = 1_000; // 1 second
const MAX_LEASE_MS = 300_000; // 5 minutes
const MIN_LIMIT = 1;
const MAX_LIMIT = 45;

@Injectable()
export class ClaimBatchUseCase {
  constructor(private readonly repo: PrintJobRepositoryPort) {}

  async execute(
    installation: string,
    leaseMs: number = DEFAULT_LEASE_MS,
    limit: number,
  ): Promise<PrintJob[]> {
    if (
      !Number.isInteger(leaseMs) ||
      leaseMs < MIN_LEASE_MS ||
      leaseMs > MAX_LEASE_MS
    ) {
      throw new ValidationError(
        `lease_ms must be an integer between ${MIN_LEASE_MS} and ${MAX_LEASE_MS}`,
      );
    }

    if (!Number.isInteger(limit) || limit < MIN_LIMIT || limit > MAX_LIMIT) {
      throw new ValidationError(
        `limit must be an integer between ${MIN_LIMIT} and ${MAX_LIMIT}`,
      );
    }

    return this.repo.claimBatch(installation, leaseMs, limit);
  }
}
