import { CompleteJobUseCase } from "./complete-job.use-case";
import { PrintJobRepositoryPort } from "./print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";
import { NotFoundError, ConflictError } from "../../../shared/errors/domain.error";

describe("CompleteJobUseCase", () => {
  let useCase: CompleteJobUseCase;
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
    useCase = new CompleteJobUseCase(mockRepo);
  });

  it("completes a claimed job", async () => {
    const job = new PrintJob();
    job.id = "j1";
    job.status = "completed";
    mockRepo.complete.mockResolvedValue(job);

    const result = await useCase.execute("j1", "caja-1");

    expect(result.id).toBe("j1");
    expect(result.status).toBe("completed");
    expect(mockRepo.complete).toHaveBeenCalledWith("j1", "caja-1");
  });

  it("throws NotFoundError if job cannot be completed", async () => {
    mockRepo.complete.mockResolvedValue(null);
    mockRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute("j1", "otra-caja"),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws ConflictError when lease has expired", async () => {
    mockRepo.complete.mockResolvedValue(null);
    const expiredJob = new PrintJob();
    expiredJob.id = "j1";
    expiredJob.status = "claimed";
    expiredJob.claimed_by = "caja-1";
    expiredJob.lease_expires_at = new Date(Date.now() - 10000);
    mockRepo.findById.mockResolvedValue(expiredJob);

    await expect(
      useCase.execute("j1", "caja-1"),
    ).rejects.toThrow(ConflictError);
  });
});
