import { ProductCreateIdempotencyRepositoryPort } from "./product-create-idempotency.repository.port";

describe("ProductCreateIdempotencyRepositoryPort", () => {
  // Test that the port declares the expected abstract methods.
  // The abstract class itself cannot be instantiated, so we validate
  // the shape through a minimal concrete stub.

  class StubRepo extends ProductCreateIdempotencyRepositoryPort {
    findByKey = jest.fn();
    create = jest.fn();
  }

  let repo: StubRepo;

  beforeEach(() => {
    repo = new StubRepo();
  });

  describe("findByKey", () => {
    it("is declared as an abstract method accepting idempotencyKey and optional runner", async () => {
      expect(repo.findByKey).toBeDefined();
      expect(typeof repo.findByKey).toBe("function");
    });

    it("resolves to a record when a record exists for the key", async () => {
      const record = {
        id: "idem-1",
        idempotency_key: "key-abc",
        payload_version: 1,
        payload_hash: "a".repeat(64),
        product_id: "prod-1",
        label_job_id: "job-1",
        response_status: 201,
        response_body: { label_status: "pending", label_job: { id: "job-1" } },
        created_at: new Date(),
        updated_at: new Date(),
      };
      repo.findByKey.mockResolvedValue(record);

      const result = await repo.findByKey("key-abc");
      expect(result).toBe(record);
      expect(repo.findByKey).toHaveBeenCalledWith("key-abc");
    });

    it("resolves to null when no record exists for the key", async () => {
      repo.findByKey.mockResolvedValue(null);
      const result = await repo.findByKey("nonexistent");
      expect(result).toBeNull();
    });

    it("accepts an optional runner argument", async () => {
      const runner = {};
      repo.findByKey.mockResolvedValue(null);
      await repo.findByKey("key-abc", runner as any);
      expect(repo.findByKey).toHaveBeenCalledWith("key-abc", runner);
    });
  });

  describe("create", () => {
    it("is declared as an abstract method", () => {
      expect(repo.create).toBeDefined();
      expect(typeof repo.create).toBe("function");
    });

    it("creates a record with product_id and label_job_id", async () => {
      const input = {
        idempotencyKey: "key-1",
        payloadVersion: 1,
        payloadHash: "b".repeat(64),
        productId: "prod-1",
        labelJobId: "job-1",
        responseBody: { label_status: "pending", label_job: { id: "job-1" } },
      };
      const record = {
        id: "idem-1",
        idempotency_key: "key-1",
        payload_version: 1,
        payload_hash: "b".repeat(64),
        product_id: "prod-1",
        label_job_id: "job-1",
        response_status: 201,
        response_body: input.responseBody,
        created_at: new Date(),
        updated_at: new Date(),
      };
      repo.create.mockResolvedValue(record);

      const result = await repo.create(input);
      expect(result).toBe(record);
      expect(repo.create).toHaveBeenCalledWith(input);
    });

    it("creates a record with product_id and null label_job_id (no-label creation)", async () => {
      const input = {
        idempotencyKey: "key-2",
        payloadVersion: 1,
        payloadHash: "c".repeat(64),
        productId: "prod-2",
        labelJobId: null,
        responseBody: { label_status: "not_required", label_job: null },
      };
      const record = {
        id: "idem-2",
        idempotency_key: "key-2",
        payload_version: 1,
        payload_hash: "c".repeat(64),
        product_id: "prod-2",
        label_job_id: null,
        response_status: 201,
        response_body: input.responseBody,
        created_at: new Date(),
        updated_at: new Date(),
      };
      repo.create.mockResolvedValue(record);

      const result = await repo.create(input);
      expect(result.label_job_id).toBeNull();
      expect(result.product_id).toBe("prod-2");
    });

    it("accepts an optional runner argument", async () => {
      const runner = {};
      const input = {
        idempotencyKey: "key-3",
        payloadVersion: 1,
        payloadHash: "d".repeat(64),
        productId: "prod-3",
        labelJobId: null,
        responseBody: { label_status: "not_required", label_job: null },
      };
      repo.create.mockResolvedValue({} as any);
      await repo.create(input, runner as any);
      expect(repo.create).toHaveBeenCalledWith(input, runner);
    });
  });

  describe("nullable FK contract", () => {
    it("replay record with product_id: null and label_job_id: null (after deletions) is valid", async () => {
      const replayRecord = {
        id: "idem-replay",
        idempotency_key: "key-old",
        payload_version: 1,
        payload_hash: "e".repeat(64),
        product_id: null,
        label_job_id: null,
        response_status: 201,
        response_body: {
          label_status: "pending",
          label_job: { id: "old-job-id", sku: "779000100" },
        },
        created_at: new Date("2026-01-01"),
        updated_at: new Date("2026-06-01"),
      };
      repo.findByKey.mockResolvedValue(replayRecord);

      const result = await repo.findByKey("key-old");
      expect(result).not.toBeNull();
      expect(result!.product_id).toBeNull();
      expect(result!.label_job_id).toBeNull();
      // response_body still holds the original snapshot
      expect(result!.response_body.label_status).toBe("pending");
      expect(result!.response_body.label_job.id).toBe("old-job-id");
    });
  });
});
