import { AutoLabelJobService } from "./auto-label-job.service";
import { PrintJobRepositoryPort } from "./print-job.repository.port";
import { PrintJob } from "../domain/print-job.entity";

describe("AutoLabelJobService", () => {
  let service: AutoLabelJobService;
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
    job.source = overrides.source ?? "auto";
    return job;
  }

  function aProduct(overrides: Record<string, unknown> = {}) {
    return {
      id: "p1",
      detalle: "Leche Entera 1L",
      costo_final: "1250.50",
      codigos: ["7791234000001"],
      ...overrides,
    };
  }

  function aRunner(): any {
    return {
      query: jest.fn().mockResolvedValue(undefined),
      manager: undefined,
    };
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
      cancelPendingByProduct: jest.fn(),
    } as any;
    service = new AutoLabelJobService(mockRepo);
  });

  describe("onProductPriceChanged", () => {
    it("creates an auto label job when no prior job exists", async () => {
      const runner = aRunner();
      mockRepo.cancelPendingByProduct.mockResolvedValue(0);
      const job = aJob();
      mockRepo.create.mockResolvedValue(job);

      const product = aProduct({ costo_final: "100.00" });
      await service.onProductPriceChanged(product as any, "1250.50", runner);

      expect(mockRepo.cancelPendingByProduct).toHaveBeenCalledWith("p1", runner);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          product_id: "p1",
          sku: "7791234000001",
          product_name: "Leche Entera 1L",
          sale_price: "1250.50",
          source: "auto",
        }),
        runner,
      );
    });

    it("uses the first barcode as SKU when codigos is non-empty", async () => {
      const runner = aRunner();
      mockRepo.cancelPendingByProduct.mockResolvedValue(0);
      const job = aJob();
      mockRepo.create.mockResolvedValue(job);

      const product = aProduct({ codigos: ["ABC123", "DEF456"] });
      await service.onProductPriceChanged(product as any, "200.00", runner);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sku: "ABC123" }),
        runner,
      );
    });

    it("uses empty string as SKU when codigos is empty", async () => {
      const runner = aRunner();
      mockRepo.cancelPendingByProduct.mockResolvedValue(0);
      const job = aJob();
      mockRepo.create.mockResolvedValue(job);

      const product = aProduct({ codigos: [] });
      await service.onProductPriceChanged(product as any, "300.00", runner);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sku: "" }),
        runner,
      );
    });

    it("cancels stale pending auto jobs before creating new one", async () => {
      const runner = aRunner();
      mockRepo.cancelPendingByProduct.mockResolvedValue(2);
      const job = aJob();
      mockRepo.create.mockResolvedValue(job);

      const product = aProduct();
      await service.onProductPriceChanged(product as any, "2000.00", runner);

      expect(mockRepo.cancelPendingByProduct).toHaveBeenCalledWith("p1", runner);
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });

    it("does nothing when final price is unchanged (same as existing)", async () => {
      const runner = aRunner();
      const product = aProduct({ costo_final: "1250.50" });
      await service.onProductPriceChanged(product as any, "1250.50", runner);

      expect(mockRepo.cancelPendingByProduct).not.toHaveBeenCalled();
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it("does nothing when new price is null (cleared price)", async () => {
      const runner = aRunner();
      const product = aProduct({ costo_final: "100.00" });
      await service.onProductPriceChanged(product as any, null, runner);

      expect(mockRepo.cancelPendingByProduct).not.toHaveBeenCalled();
      expect(mockRepo.create).not.toHaveBeenCalled();
    });

    it("creates a job when price changes from null to a value", async () => {
      const runner = aRunner();
      mockRepo.cancelPendingByProduct.mockResolvedValue(0);
      const job = aJob();
      mockRepo.create.mockResolvedValue(job);

      const product = aProduct({ costo_final: null });
      await service.onProductPriceChanged(product as any, "500.00", runner);

      expect(mockRepo.cancelPendingByProduct).toHaveBeenCalledWith("p1", runner);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sale_price: "500.00" }),
        runner,
      );
    });

    it("handles rapid A→B→C changes: cancels old, creates new each time", async () => {
      const runnerA = aRunner();
      mockRepo.cancelPendingByProduct.mockResolvedValue(1);
      const jobA = aJob({ sale_price: "100.00" });
      const jobB = aJob({ id: "j2", sale_price: "200.00" });
      const jobC = aJob({ id: "j3", sale_price: "300.00" });

      mockRepo.create
        .mockResolvedValueOnce(jobA)
        .mockResolvedValueOnce(jobB)
        .mockResolvedValueOnce(jobC);

      const product = aProduct({ costo_final: "100.00" });

      // A→B
      await service.onProductPriceChanged(product as any, "200.00", runnerA);
      expect(mockRepo.cancelPendingByProduct).toHaveBeenCalledTimes(1);
      expect(mockRepo.create).toHaveBeenCalledTimes(1);

      // B→C (simulate product now at B's price)
      mockRepo.cancelPendingByProduct.mockClear();
      mockRepo.create.mockClear();
      mockRepo.cancelPendingByProduct.mockResolvedValue(1);
      mockRepo.create.mockResolvedValue(jobC);

      const runnerB = aRunner();
      await service.onProductPriceChanged(product as any, "300.00", runnerB);
      expect(mockRepo.cancelPendingByProduct).toHaveBeenCalledTimes(1);
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });

    it("repeated same price does not trigger duplicate jobs", async () => {
      const runner = aRunner();
      mockRepo.cancelPendingByProduct.mockResolvedValue(0);
      const job = aJob();
      mockRepo.create.mockResolvedValue(job);

      const product = aProduct({ costo_final: "400.00" });

      // First call: new price 500 (different from current 400)
      await service.onProductPriceChanged(product as any, "500.00", runner);
      expect(mockRepo.create).toHaveBeenCalledTimes(1);

      // Second call: same price as product's current costo_final
      mockRepo.cancelPendingByProduct.mockClear();
      mockRepo.create.mockClear();

      const updatedProduct = aProduct({ costo_final: "500.00" });
      await service.onProductPriceChanged(updatedProduct as any, "500.00", runner);
      expect(mockRepo.cancelPendingByProduct).not.toHaveBeenCalled();
      expect(mockRepo.create).not.toHaveBeenCalled();
    });
  });

  describe("concurrency safety", () => {
    it("acquires advisory lock via runner before cancel and create", async () => {
      const calls: string[] = [];
      const runner: any = {
        query: jest.fn().mockImplementation(async (sql: string) => {
          calls.push(sql);
        }),
        manager: undefined,
      };

      mockRepo.cancelPendingByProduct.mockImplementation(async () => {
        calls.push("cancel");
        return 0;
      });
      mockRepo.create.mockImplementation(async () => {
        calls.push("create");
        return aJob();
      });

      await service.onProductPriceChanged(
        aProduct() as any,
        "999.00",
        runner,
      );

      // Lock must be acquired before cancel
      const lockIdx = calls.findIndex((c) =>
        c.includes("pg_advisory_xact_lock"),
      );
      const cancelIdx = calls.indexOf("cancel");
      const createIdx = calls.indexOf("create");

      expect(lockIdx).toBeGreaterThan(-1);
      expect(lockIdx).toBeLessThan(cancelIdx);
      expect(cancelIdx).toBeLessThan(createIdx);
    });

    it("propagates PG 23505 unique violation without catching or re-querying", async () => {
      const runner = aRunner();

      mockRepo.cancelPendingByProduct.mockResolvedValue(0);

      const dupErr = new Error("duplicate key value violates unique constraint") as any;
      dupErr.code = "23505";
      mockRepo.create.mockRejectedValue(dupErr);

      await expect(
        service.onProductPriceChanged(aProduct() as any, "999.00", runner),
      ).rejects.toThrow("duplicate key");

      // Must not attempt to re-read after the error
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
      expect(mockRepo.cancelPendingByProduct).toHaveBeenCalledTimes(1);
    });

    it("re-throws non-23505 errors from create", async () => {
      const runner = aRunner();

      mockRepo.cancelPendingByProduct.mockResolvedValue(0);
      const otherErr = new Error("connection lost");
      mockRepo.create.mockRejectedValue(otherErr);

      await expect(
        service.onProductPriceChanged(aProduct() as any, "999.00", runner),
      ).rejects.toThrow("connection lost");

      expect(mockRepo.cancelPendingByProduct).toHaveBeenCalledTimes(1);
    });
  });

  describe("transaction guard", () => {
    it("rejects when runner is undefined", async () => {
      // runner is now required — passing undefined must throw
      await expect(
        service.onProductPriceChanged(aProduct() as any, "999.00", undefined as any),
      ).rejects.toThrow(/runner is required/i);
    });

    it("accepts a provided runner and proceeds normally", async () => {
      const runner = aRunner();
      mockRepo.cancelPendingByProduct.mockResolvedValue(0);
      mockRepo.create.mockResolvedValue(aJob());

      const result = await service.onProductPriceChanged(
        aProduct() as any,
        "999.00",
        runner,
      );

      expect(result).not.toBeNull();
      expect(mockRepo.cancelPendingByProduct).toHaveBeenCalledWith("p1", runner);
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sale_price: "999.00" }),
        runner,
      );
    });
  });

  describe("replacement after superseding", () => {
    it("allows creating a new job after the previous was superseded", async () => {
      const runner = aRunner();
      // cancelPendingByProduct returns >0 meaning stale job(s) were superseded
      mockRepo.cancelPendingByProduct.mockResolvedValue(1);
      const newJob = aJob({ id: "j2", sale_price: "2000.00" });
      mockRepo.create.mockResolvedValue(newJob);

      const product = aProduct({ costo_final: "1000.00" });
      const result = await service.onProductPriceChanged(product as any, "2000.00", runner);

      expect(result).not.toBeNull();
      expect(result!.id).toBe("j2");
      expect(result!.sale_price).toBe("2000.00");
      expect(mockRepo.cancelPendingByProduct).toHaveBeenCalledWith("p1", runner);
      expect(mockRepo.create).toHaveBeenCalledTimes(1);
    });
  });
});
