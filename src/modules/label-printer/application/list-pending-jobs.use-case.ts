import { Injectable } from "@nestjs/common";
import { PrintJobRepositoryPort } from "./print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";

@Injectable()
export class ListPendingJobsUseCase {
  constructor(private readonly repo: PrintJobRepositoryPort) {}

  async execute(): Promise<PrintJob[]> {
    return this.repo.findPending();
  }
}
