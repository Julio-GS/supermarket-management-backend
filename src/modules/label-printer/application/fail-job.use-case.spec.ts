import { FailJobUseCase } from "./fail-job.use-case";
import { PrintJobRepositoryPort } from "./print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";
import { NotFoundError, ConflictError } from "../../../shared/errors/domain.error";

describe("FailJobUseCase", () => {
  let useCase: FailJobUseCase;
  let mockRepo: jest.Mocked<PrintJobRepositoryPort>;

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findById: jest.fn(),
      findPending: jest.fn(),
      claimNext: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn(),
      expireLeases: jest.fn(),
    } as any;
    useCase = new FailJobUseCase(mockRepo);
  });

  it("marks a job as failed with a reason", async () => {
    const job = new PrintJob();
    job.id = "j1";
    job.status = "failed";
    job.fail_reason = "Printer offline";
    mockRepo.fail.mockResolvedValue(job);

    const result = await useCase.execute("j1", "caja-1", "Printer offline");

    expect(result.id).toBe("j1");
    expect(result.status).toBe("failed");
    expect(result.fail_reason).toBe("Printer offline");
    expect(mockRepo.fail).toHaveBeenCalledWith("j1", "caja-1", "Printer offline");
  });

  it("throws NotFoundError when job cannot be failed", async () => {
    mockRepo.fail.mockResolvedValue(null);
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute("j1", "otra-caja", "offline"),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ConflictError when lease has expired", async () => {
    mockRepo.fail.mockResolvedValue(null);
    const expiredJob = new PrintJob();
    expiredJob.id = "j1";
    expiredJob.status = "claimed";
    expiredJob.claimed_by = "caja-1";
    expiredJob.lease_expires_at = new Date(Date.now() - 10000);
    mockRepo.findById.mockResolvedValue(expiredJob);

    await expect(
      useCase.execute("j1", "caja-1", "offline"),
    ).rejects.toThrow(ConflictError);
  });

  it("throws ConflictError 'job is blocked' when the job is blocked", async () => {
    mockRepo.fail.mockResolvedValue(null);
    const blockedJob = new PrintJob();
    blockedJob.id = "j1";
    blockedJob.status = "blocked_for_review";
    blockedJob.claimed_by = "caja-1";
    mockRepo.findById.mockResolvedValue(blockedJob);

    await expect(
      useCase.execute("j1", "caja-1", "offline"),
    ).rejects.toThrow(/job is blocked/);
  });
});
