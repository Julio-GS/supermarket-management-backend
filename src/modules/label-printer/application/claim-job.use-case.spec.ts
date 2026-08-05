import { ClaimJobUseCase } from "./claim-job.use-case";
import { PrintJobRepositoryPort } from "./print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";

describe("ClaimJobUseCase", () => {
  let useCase: ClaimJobUseCase;
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
    useCase = new ClaimJobUseCase(mockRepo);
  });

  it("claims the next available job for an installation", async () => {
    const job = new PrintJob();
    job.id = "j1";
    job.status = "claimed";
    job.claimed_by = "caja-1";
    mockRepo.claimNext.mockResolvedValue(job);

    const result = await useCase.execute("caja-1");

    expect(result).not.toBeNull();
    expect(result!.id).toBe("j1");
    expect(mockRepo.claimNext).toHaveBeenCalledWith("caja-1", 30000);
  });

  it("returns null when no jobs are available", async () => {
    mockRepo.claimNext.mockResolvedValue(null);

    const result = await useCase.execute("caja-1");

    expect(result).toBeNull();
  });

  it("accepts a custom lease duration", async () => {
    mockRepo.claimNext.mockResolvedValue(null);

    await useCase.execute("caja-1", 60000);

    expect(mockRepo.claimNext).toHaveBeenCalledWith("caja-1", 60000);
  });

  describe("lease_ms validation", () => {
    it("rejects lease_ms below the minimum (1000 ms)", async () => {
      await expect(useCase.execute("caja-1", 500)).rejects.toThrow(
        "lease_ms must be an integer between 1000 and 300000",
      );
    });

    it("rejects lease_ms above the maximum (300000 ms)", async () => {
      await expect(useCase.execute("caja-1", 400000)).rejects.toThrow(
        "lease_ms must be an integer between 1000 and 300000",
      );
    });

    it("rejects non-integer lease_ms", async () => {
      await expect(useCase.execute("caja-1", 1.5)).rejects.toThrow(
        "lease_ms must be an integer between 1000 and 300000",
      );
    });

    it("accepts lease_ms at minimum boundary (1000)", async () => {
      mockRepo.claimNext.mockResolvedValue(null);

      await useCase.execute("caja-1", 1000);

      expect(mockRepo.claimNext).toHaveBeenCalledWith("caja-1", 1000);
    });

    it("accepts lease_ms at maximum boundary (300000)", async () => {
      mockRepo.claimNext.mockResolvedValue(null);

      await useCase.execute("caja-1", 300000);

      expect(mockRepo.claimNext).toHaveBeenCalledWith("caja-1", 300000);
    });
  });
});
