import { CreatePrintJobUseCase } from "./create-print-job.use-case";
import { PrintJobRepositoryPort } from "./print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";
import { ConflictError } from "../../../shared/errors/domain.error";

describe("CreatePrintJobUseCase", () => {
  let useCase: CreatePrintJobUseCase;
  let mockRepo: jest.Mocked<PrintJobRepositoryPort>;

  function aJob(overrides: Partial<PrintJob> = {}): PrintJob {
    const job = new PrintJob();
    job.id = overrides.id ?? "j1";
    job.product_id = overrides.product_id ?? "p1";
    job.sku = overrides.sku ?? "7791234000001";
    job.product_name = overrides.product_name ?? "Leche Entera 1L";
    job.sale_price = overrides.sale_price ?? "1250.50";
    job.status = overrides.status ?? "pending";
    job.idempotency_key = overrides.idempotency_key ?? null;
    return job;
  }

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
    useCase = new CreatePrintJobUseCase(mockRepo);
  });

  it("creates a print job with product snapshot", async () => {
    const job = aJob();
    mockRepo.create.mockResolvedValue(job);

    const result = await useCase.execute({
      product_id: "p1",
      sku: "7791234000001",
      product_name: "Leche Entera 1L",
      sale_price: "1250.50",
      idempotency_key: "req-001",
    });

    expect(result.id).toBe("j1");
    expect(mockRepo.create).toHaveBeenCalledWith({
      product_id: "p1",
      sku: "7791234000001",
      product_name: "Leche Entera 1L",
      sale_price: "1250.50",
      idempotency_key: "req-001",
    });
  });

  it("throws ConflictError on duplicate idempotency_key", async () => {
    mockRepo.create.mockRejectedValue(
      Object.assign(new Error('duplicate key value violates unique constraint "label_print_jobs_idempotency_key_key"'), { code: "23505" }),
    );

    await expect(
      useCase.execute({
        product_id: "p1",
        sku: "779",
        product_name: "X",
        sale_price: "1.00",
        idempotency_key: "dup-key",
      }),
    ).rejects.toThrow(ConflictError);
  });

  it("propagates non-duplicate errors", async () => {
    mockRepo.create.mockRejectedValue(new Error("Connection lost"));

    await expect(
      useCase.execute({
        product_id: "p1",
        sku: "779",
        product_name: "X",
        sale_price: "1.00",
      }),
    ).rejects.toThrow("Connection lost");
  });

  describe("idempotent create", () => {
    it("returns the existing job when same idempotency key and same immutable payload", async () => {
      const existing = aJob({ id: "existing-1", idempotency_key: "ik-abc" });
      mockRepo.findByIdempotencyKey.mockResolvedValue(existing);

      const result = await useCase.execute({
        product_id: "p1",
        sku: "7791234000001",
        product_name: "Leche Entera 1L",
        sale_price: "1250.50",
        idempotency_key: "ik-abc",
      });

      expect(result.id).toBe("existing-1");
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it("throws ConflictError when same idempotency key but different product_id", async () => {
      const existing = aJob({ id: "existing-1", idempotency_key: "ik-abc", product_id: "p-original" });
      mockRepo.findByIdempotencyKey.mockResolvedValue(existing);

      await expect(
        useCase.execute({
          product_id: "p-different",
          sku: "7791234000001",
          product_name: "Leche Entera 1L",
          sale_price: "1250.50",
          idempotency_key: "ik-abc",
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("throws ConflictError when same idempotency key but different sku", async () => {
      const existing = aJob({ id: "existing-1", idempotency_key: "ik-abc", sku: "7790000000001" });
      mockRepo.findByIdempotencyKey.mockResolvedValue(existing);

      await expect(
        useCase.execute({
          product_id: "p1",
          sku: "7799999999999",
          product_name: "Leche Entera 1L",
          sale_price: "1250.50",
          idempotency_key: "ik-abc",
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("throws ConflictError when same idempotency key but different product_name", async () => {
      const existing = aJob({ id: "existing-1", idempotency_key: "ik-abc", product_name: "Original" });
      mockRepo.findByIdempotencyKey.mockResolvedValue(existing);

      await expect(
        useCase.execute({
          product_id: "p1",
          sku: "7791234000001",
          product_name: "Different",
          sale_price: "1250.50",
          idempotency_key: "ik-abc",
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("throws ConflictError when same idempotency key but different sale_price", async () => {
      const existing = aJob({ id: "existing-1", idempotency_key: "ik-abc", sale_price: "100.00" });
      mockRepo.findByIdempotencyKey.mockResolvedValue(existing);

      await expect(
        useCase.execute({
          product_id: "p1",
          sku: "7791234000001",
          product_name: "Leche Entera 1L",
          sale_price: "200.00",
          idempotency_key: "ik-abc",
        }),
      ).rejects.toThrow(ConflictError);
    });

    it("creates a new job when idempotency_key is not provided", async () => {
      const job = aJob();
      mockRepo.create.mockResolvedValue(job);

      const result = await useCase.execute({
        product_id: "p1",
        sku: "779",
        product_name: "X",
        sale_price: "1.00",
      });

      expect(result.id).toBe("j1");
      expect(mockRepo.findByIdempotencyKey).not.toHaveBeenCalled();
      expect(mockRepo.create).toHaveBeenCalled();
    });

    it("handles PG 23505 race by re-reading and comparing payload", async () => {
      // First lookup: key not found
      mockRepo.findByIdempotencyKey.mockResolvedValue(null);
      // Insert fails with 23505 (race)
      mockRepo.create.mockRejectedValue(
        Object.assign(new Error("duplicate"), { code: "23505" }),
      );
      // Re-read after 23505 finds the racer's job with same payload
      const raced = aJob({ id: "raced-1", idempotency_key: "ik-race" });
      // Second call to findByIdempotencyKey (after the race)
      mockRepo.findByIdempotencyKey
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(raced);

      const result = await useCase.execute({
        product_id: "p1",
        sku: "7791234000001",
        product_name: "Leche Entera 1L",
        sale_price: "1250.50",
        idempotency_key: "ik-race",
      });

      expect(result.id).toBe("raced-1");
    });

    it("throws ConflictError after PG 23505 race when payloads differ", async () => {
      mockRepo.findByIdempotencyKey.mockResolvedValue(null);
      mockRepo.create.mockRejectedValue(
        Object.assign(new Error("duplicate"), { code: "23505" }),
      );
      const raced = aJob({ id: "raced-1", idempotency_key: "ik-race", sku: "different-sku" });
      mockRepo.findByIdempotencyKey
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(raced);

      await expect(
        useCase.execute({
          product_id: "p1",
          sku: "7791234000001",
          product_name: "Leche Entera 1L",
          sale_price: "1250.50",
          idempotency_key: "ik-race",
        }),
      ).rejects.toThrow(ConflictError);
    });
  });
});
