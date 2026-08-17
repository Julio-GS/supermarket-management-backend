import { BlockJobUseCase } from "./block-job.use-case";
import { PrintJobRepositoryPort } from "./print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from "../../../shared/errors/domain.error";

describe("BlockJobUseCase", () => {
  let useCase: BlockJobUseCase;
  let mockRepo: jest.Mocked<Pick<PrintJobRepositoryPort, "block" | "findById">>;

  beforeEach(() => {
    mockRepo = {
      block: jest.fn(),
      findById: jest.fn(),
    } as any;
    useCase = new BlockJobUseCase(mockRepo as any);
  });

  it("blocks a claimed job and returns the updated job with audit fields", async () => {
    const job = new PrintJob();
    job.id = "j1";
    job.status = "blocked_for_review";
    job.blocked_reason = "Manual review needed";
    job.blocked_by = "caja-1";
    job.blocked_at = new Date("2026-03-01T12:00:00Z");
    mockRepo.block.mockResolvedValue(job);

    const result = await useCase.execute("j1", "caja-1", "Manual review needed");

    expect(result.status).toBe("blocked_for_review");
    expect(result.blocked_reason).toBe("Manual review needed");
    expect(result.blocked_by).toBe("caja-1");
    expect(result.blocked_at).toEqual(new Date("2026-03-01T12:00:00Z"));
    expect(mockRepo.block).toHaveBeenCalledWith(
      "j1",
      "caja-1",
      "Manual review needed",
    );
  });

  it("persists the exact reason text including surrounding spaces when non-empty", async () => {
    const job = new PrintJob();
    job.status = "blocked_for_review";
    job.blocked_reason = "  Manual review needed  ";
    mockRepo.block.mockResolvedValue(job);

    await useCase.execute("j1", "caja-1", "  Manual review needed  ");

    expect(mockRepo.block).toHaveBeenCalledWith(
      "j1",
      "caja-1",
      "  Manual review needed  ",
    );
  });

  it("throws ValidationError when reason is empty/whitespace", async () => {
    await expect(useCase.execute("j1", "caja-1", "   ")).rejects.toThrow(
      ValidationError,
    );
    expect(mockRepo.block).not.toHaveBeenCalled();
  });

  it("throws ValidationError when reason exceeds 500 characters", async () => {
    await expect(
      useCase.execute("j1", "caja-1", "x".repeat(501)),
    ).rejects.toThrow(ValidationError);
    expect(mockRepo.block).not.toHaveBeenCalled();
  });

  it("throws ValidationError when installation is empty", async () => {
    await expect(useCase.execute("j1", "  ", "reason")).rejects.toThrow(
      ValidationError,
    );
    expect(mockRepo.block).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the job does not exist", async () => {
    mockRepo.block.mockResolvedValue(null);
    mockRepo.findById.mockResolvedValue(null);

    await expect(useCase.execute("j1", "caja-1", "reason")).rejects.toThrow(
      NotFoundError,
    );
  });

  it("throws ConflictError when the job is already blocked", async () => {
    mockRepo.block.mockResolvedValue(null);
    const job = new PrintJob();
    job.id = "j1";
    job.status = "blocked_for_review";
    mockRepo.findById.mockResolvedValue(job);

    await expect(useCase.execute("j1", "caja-1", "reason")).rejects.toThrow(
      /job is blocked/,
    );
  });

  it("throws ConflictError when the job is not in claimed status", async () => {
    mockRepo.block.mockResolvedValue(null);
    const job = new PrintJob();
    job.id = "j1";
    job.status = "pending";
    mockRepo.findById.mockResolvedValue(job);

    await expect(useCase.execute("j1", "caja-1", "reason")).rejects.toThrow(
      /not in claimed status/,
    );
  });

  it("throws ConflictError when the installation does not match", async () => {
    mockRepo.block.mockResolvedValue(null);
    const job = new PrintJob();
    job.id = "j1";
    job.status = "claimed";
    job.claimed_by = "other-caja";
    mockRepo.findById.mockResolvedValue(job);

    await expect(useCase.execute("j1", "caja-1", "reason")).rejects.toThrow(
      /installation mismatch/,
    );
  });

  it("throws ConflictError when the lease has expired", async () => {
    mockRepo.block.mockResolvedValue(null);
    const job = new PrintJob();
    job.id = "j1";
    job.status = "claimed";
    job.claimed_by = "caja-1";
    job.lease_expires_at = new Date(Date.now() - 10000);
    mockRepo.findById.mockResolvedValue(job);

    await expect(useCase.execute("j1", "caja-1", "reason")).rejects.toThrow(
      /lease expired/,
    );
  });
});
