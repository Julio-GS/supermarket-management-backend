import { Injectable } from "@nestjs/common";
import { PrintJobRepositoryPort } from "./print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from "../../../shared/errors/domain.error";

const MAX_REASON_LENGTH = 500;

@Injectable()
export class BlockJobUseCase {
  constructor(private readonly repo: PrintJobRepositoryPort) {}

  async execute(
    jobId: string,
    installation: string,
    reason: string,
  ): Promise<PrintJob> {
    const normalizedInstallation = installation ?? "";
    if (normalizedInstallation.trim().length === 0) {
      throw new ValidationError("installation is required");
    }

    const normalizedReason = reason ?? "";
    if (normalizedReason.trim().length === 0) {
      throw new ValidationError("reason required");
    }
    if (normalizedReason.length > MAX_REASON_LENGTH) {
      throw new ValidationError(
        `reason must be at most ${MAX_REASON_LENGTH} characters`,
      );
    }

    const job = await this.repo.block(jobId, installation, reason);
    if (job) {
      return job;
    }

    const existing = await this.repo.findById(jobId);
    if (!existing) {
      throw new NotFoundError(`Print job ${jobId} not found`);
    }

    if (existing.status === "blocked_for_review") {
      throw new ConflictError("job is blocked");
    }
    if (existing.status !== "claimed") {
      throw new ConflictError("job not in claimed status");
    }
    if (existing.claimed_by !== installation) {
      throw new ConflictError("installation mismatch");
    }
    if (
      existing.lease_expires_at &&
      existing.lease_expires_at < new Date()
    ) {
      throw new ConflictError("lease expired");
    }

    // Defensive fallback: atomic update failed for an unknown reason.
    throw new ConflictError("job cannot be blocked");
  }
}
