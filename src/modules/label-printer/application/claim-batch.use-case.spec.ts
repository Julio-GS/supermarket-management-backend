import { ClaimBatchUseCase } from "./claim-batch.use-case";
import { PrintJobRepositoryPort } from "./print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";

describe("ClaimBatchUseCase", () => {
  let useCase: ClaimBatchUseCase;
  let mockRepo: jest.Mocked<PrintJobRepositoryPort>;

  beforeEach(() => {
    mockRepo = {
      create: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      findById: jest.fn(),
      findPending: jest.fn(),
      claimNext: jest.fn(),
      claimBatch: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn(),
      expireLeases: jest.fn(),
      cancelPendingByProduct: jest.fn(),
    } as any;
    useCase = new ClaimBatchUseCase(mockRepo);
  });

  it("claims a batch of up to `limit` jobs for an installation", async () => {
    const jobs = [
      Object.assign(new PrintJob(), { id: "j1", status: "claimed", claimed_by: "caja-1" }),
      Object.assign(new PrintJob(), { id: "j2", status: "claimed", claimed_by: "caja-1" }),
    ];
    mockRepo.claimBatch.mockResolvedValue(jobs);

    const result = await useCase.execute("caja-1", 300000, 5);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("j1");
    expect(mockRepo.claimBatch).toHaveBeenCalledWith("caja-1", 300000, 5);
  });

  it("returns empty array when no jobs are available", async () => {
    mockRepo.claimBatch.mockResolvedValue([]);

    const result = await useCase.execute("caja-1", 300000, 3);

    expect(result).toEqual([]);
  });

  it("accepts a custom lease duration", async () => {
    mockRepo.claimBatch.mockResolvedValue([]);

    await useCase.execute("caja-1", 60000, 10);

    expect(mockRepo.claimBatch).toHaveBeenCalledWith("caja-1", 60000, 10);
  });

  it("defaults lease_ms to 30000 when omitted", async () => {
    mockRepo.claimBatch.mockResolvedValue([]);

    await useCase.execute("caja-1", undefined as any, 5);

    expect(mockRepo.claimBatch).toHaveBeenCalledWith("caja-1", 30000, 5);
  });

  describe("lease_ms validation", () => {
    it("rejects lease_ms below the minimum (1000 ms)", async () => {
      await expect(useCase.execute("caja-1", 500, 5)).rejects.toThrow(
        "lease_ms must be an integer between 1000 and 300000",
      );
    });

    it("rejects lease_ms above the maximum (300000 ms)", async () => {
      await expect(useCase.execute("caja-1", 400000, 5)).rejects.toThrow(
        "lease_ms must be an integer between 1000 and 300000",
      );
    });

    it("rejects non-integer lease_ms", async () => {
      await expect(useCase.execute("caja-1", 1.5, 5)).rejects.toThrow(
        "lease_ms must be an integer between 1000 and 300000",
      );
    });

    it("accepts lease_ms at minimum boundary (1000)", async () => {
      mockRepo.claimBatch.mockResolvedValue([]);

      await useCase.execute("caja-1", 1000, 5);

      expect(mockRepo.claimBatch).toHaveBeenCalledWith("caja-1", 1000, 5);
    });

    it("accepts lease_ms at maximum boundary (300000)", async () => {
      mockRepo.claimBatch.mockResolvedValue([]);

      await useCase.execute("caja-1", 300000, 5);

      expect(mockRepo.claimBatch).toHaveBeenCalledWith("caja-1", 300000, 5);
    });
  });

  describe("limit validation", () => {
    it("rejects limit below minimum (1)", async () => {
      await expect(useCase.execute("caja-1", 300000, 0)).rejects.toThrow(
        "limit must be an integer between 1 and 45",
      );
    });

    it("rejects limit above maximum (45)", async () => {
      await expect(useCase.execute("caja-1", 300000, 46)).rejects.toThrow(
        "limit must be an integer between 1 and 45",
      );
    });

    it("rejects non-integer limit", async () => {
      await expect(useCase.execute("caja-1", 300000, 3.5)).rejects.toThrow(
        "limit must be an integer between 1 and 45",
      );
    });

    it("accepts limit at minimum boundary (1)", async () => {
      mockRepo.claimBatch.mockResolvedValue([]);

      await useCase.execute("caja-1", 300000, 1);

      expect(mockRepo.claimBatch).toHaveBeenCalledWith("caja-1", 300000, 1);
    });

    it("accepts limit at maximum boundary (45)", async () => {
      mockRepo.claimBatch.mockResolvedValue([]);

      await useCase.execute("caja-1", 300000, 45);

      expect(mockRepo.claimBatch).toHaveBeenCalledWith("caja-1", 300000, 45);
    });
  });
});
