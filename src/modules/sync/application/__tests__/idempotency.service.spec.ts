import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { IdempotencyService } from "../idempotency.service";
import { IdempotencyRecordEntity } from "../../infrastructure/idempotency-record.entity";
import { createHash } from "node:crypto";

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

describe("IdempotencyService", () => {
  let service: IdempotencyService;
  let repo: Repository<IdempotencyRecordEntity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        {
          provide: getRepositoryToken(IdempotencyRecordEntity),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    repo = module.get<Repository<IdempotencyRecordEntity>>(
      getRepositoryToken(IdempotencyRecordEntity),
    );
  });

  // -----------------------------------------------------------------------
  // RED — these tests fail until IdempotencyService is implemented
  // -----------------------------------------------------------------------

  describe("hasBeenProcessed", () => {
    it("returns true when an idempotency key exists with matching payload hash", async () => {
      const key = "inst-1:out-1";
      const payload = { saleId: "s1" };
      const hash = sha256(JSON.stringify(payload));

      (repo.findOne as jest.Mock).mockResolvedValue({
        idempotency_key: key,
        operation_hash: hash,
        status: "accepted",
      });

      const result = await service.hasBeenProcessed(key, payload);
      expect(result).toBe(true);
    });

    it("returns false when the key does not exist at all", async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.hasBeenProcessed("inst-1:new", { x: 1 });
      expect(result).toBe(false);
    });
  });

  describe("checkIdempotencyViolation", () => {
    it("throws when the key exists with a DIFFERENT payload hash (violation)", async () => {
      const key = "inst-1:out-1";
      const originalPayload = JSON.stringify({ saleId: "s1" });
      const newPayload = JSON.stringify({ saleId: "s1", total: "999" });

      const originalHash = sha256(originalPayload);

      (repo.findOne as jest.Mock).mockResolvedValue({
        idempotency_key: key,
        operation_hash: originalHash,
        status: "accepted",
      });

      await expect(
        service.checkIdempotencyViolation(key, newPayload),
      ).rejects.toThrow(/idempotency violation/i);
    });

    it("does NOT throw when the key exists with the SAME payload hash (duplicate, not violation)", async () => {
      const key = "inst-1:out-1";
      const payload = { saleId: "s1" };
      const hash = sha256(JSON.stringify(payload));

      (repo.findOne as jest.Mock).mockResolvedValue({
        idempotency_key: key,
        operation_hash: hash,
        status: "accepted",
      });

      await expect(
        service.checkIdempotencyViolation(key, payload),
      ).resolves.not.toThrow();
    });

    it("does NOT throw when the key does not exist (first time)", async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.checkIdempotencyViolation("inst-1:new", { x: 1 }),
      ).resolves.not.toThrow();
    });
  });

  describe("recordResult", () => {
    it("saves a new idempotency record with the operation hash", async () => {
      const key = "inst-1:out-1";
      const payload = { saleId: "s1" };
      const hash = sha256(JSON.stringify(payload));

      (repo.save as jest.Mock).mockResolvedValue({
        idempotency_key: key,
        operation_hash: hash,
        status: "accepted",
      });

      await service.recordResult(key, payload, {
        status: "accepted",
        server_id: "srv-1",
        server_version: "v2",
      });

      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotency_key: key,
          operation_hash: hash,
          status: "accepted",
          server_id: "srv-1",
          server_version: "v2",
        }),
      );
    });
  });

  describe("findExistingResult", () => {
    it("returns the stored result for a duplicate key", async () => {
      const key = "inst-1:dup";
      const stored = {
        idempotency_key: key,
        operation_hash: sha256(JSON.stringify({ a: 1 })),
        status: "accepted",
        server_id: "srv-99",
        server_version: "v10",
      };

      (repo.findOne as jest.Mock).mockResolvedValue(stored);

      const result = await service.findExistingResult(key);
      expect(result).toEqual({
        status: "accepted",
        server_id: "srv-99",
        server_version: "v10",
      });
    });

    it("returns null when no record exists", async () => {
      (repo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await service.findExistingResult("missing");
      expect(result).toBeNull();
    });
  });
});
