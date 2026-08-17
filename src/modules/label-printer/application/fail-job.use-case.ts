import { Injectable } from "@nestjs/common";
import { PrintJobRepositoryPort } from "./print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";
import { NotFoundError, ConflictError } from "../../../shared/errors/domain.error";

@Injectable()
export class FailJobUseCase {
  constructor(private readonly repo: PrintJobRepositoryPort) {}

  async execute(
    jobId: string,
    installation: string,
    reason: string,
  ): Promise<PrintJob> {
    const job = await this.repo.fail(jobId, installation, reason);
    if (!job) {
      const existing = await this.repo.findById(jobId);
      if (existing) {
        if (existing.status === "blocked_for_review") {
          throw new ConflictError("job is blocked");
        }
        if (
          existing.lease_expires_at &&
          existing.lease_expires_at < new Date()
        ) {
          throw new ConflictError(
            `Print job ${jobId} lease has expired`,
          );
        }
      }
      throw new NotFoundError(
        `Print job ${jobId} not found or not claimed by ${installation}`,
      );
    }
    return job;
  }
}
