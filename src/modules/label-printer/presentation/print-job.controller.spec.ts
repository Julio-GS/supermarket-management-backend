import { RequestMethod } from "@nestjs/common";
import { PrintJobController } from "./print-job.controller";
import { ClaimBatchDto, ClaimBatchContinueDto, BlockJobDto } from "./print-job.dto";
import { CreatePrintJobUseCase } from "../application/create-print-job.use-case";
import { ListPendingJobsUseCase } from "../application/list-pending-jobs.use-case";
import { ClaimJobUseCase } from "../application/claim-job.use-case";
import { ClaimBatchUseCase } from "../application/claim-batch.use-case";
import { ClaimBatchContinueUseCase } from "../application/claim-batch-continue.use-case";
import { BlockJobUseCase } from "../application/block-job.use-case";
import { CompleteJobUseCase } from "../application/complete-job.use-case";
import { FailJobUseCase } from "../application/fail-job.use-case";
import { PrintJob } from "../domain/print-job.entity";

describe("PrintJobController", () => {
  let controller: PrintJobController;
  let mockCreateJob: jest.Mocked<Pick<CreatePrintJobUseCase, "execute">>;
  let mockListPending: jest.Mocked<Pick<ListPendingJobsUseCase, "execute">>;
  let mockClaimJob: jest.Mocked<Pick<ClaimJobUseCase, "execute">>;
  let mockClaimBatch: jest.Mocked<Pick<ClaimBatchUseCase, "execute">>;
  let mockClaimBatchContinue: jest.Mocked<Pick<ClaimBatchContinueUseCase, "execute">>;
  let mockBlockJob: jest.Mocked<Pick<BlockJobUseCase, "execute">>;
  let mockCompleteJob: jest.Mocked<Pick<CompleteJobUseCase, "execute">>;
  let mockFailJob: jest.Mocked<Pick<FailJobUseCase, "execute">>;

  beforeEach(() => {
    mockCreateJob = { execute: jest.fn() };
    mockListPending = { execute: jest.fn() };
    mockClaimJob = { execute: jest.fn() };
    mockClaimBatch = { execute: jest.fn() };
    mockClaimBatchContinue = { execute: jest.fn() };
    mockBlockJob = { execute: jest.fn() };
    mockCompleteJob = { execute: jest.fn() };
    mockFailJob = { execute: jest.fn() };

    controller = new PrintJobController(
      mockCreateJob as any,
      mockListPending as any,
      mockClaimJob as any,
      mockClaimBatch as any,
      mockClaimBatchContinue as any,
      mockBlockJob as any,
      mockCompleteJob as any,
      mockFailJob as any,
    );
  });

  describe("POST claim-batch", () => {
    it("exposes the claimBatch route handler as a callable method (not shadowed by the injected property)", () => {
      // RED: with the name collision, controller.claimBatch is the ClaimBatchUseCase
      // instance (an object), not the prototype method (a function).
      // Access via any to bypass private — the test verifies the method exists.
      const ctrl = controller as any;
      expect(typeof ctrl.claimBatch).toBe("function");
    });

    it("calls ClaimBatchUseCase.execute with installation, lease_ms, and limit", async () => {
      const dto: ClaimBatchDto = {
        installation: "caja-1",
        lease_ms: 120000,
        limit: 10,
      };

      const jobs = [
        Object.assign(new PrintJob(), {
          id: "j1",
          status: "claimed",
          claimed_by: "caja-1",
          created_at: new Date(),
          updated_at: new Date(),
        }),
      ];
      mockClaimBatch.execute.mockResolvedValue(jobs);

      // Call the route handler via any to bypass the private accessor.
      const ctrl = controller as any;
      const result = await ctrl.claimBatch(dto);

      expect(mockClaimBatch.execute).toHaveBeenCalledWith("caja-1", 120000, 10);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("j1");
    });

    it("serializes all dates via toISOString without Invalid Date", async () => {
      const dto: ClaimBatchDto = {
        installation: "caja-1",
        limit: 5,
      };

      const now = new Date("2026-03-01T12:00:00Z");
      const jobs = [
        Object.assign(new PrintJob(), {
          id: "j1",
          product_id: "p1",
          sku: "SKU-1",
          product_name: "Product 1",
          sale_price: "100.00",
          status: "claimed",
          claimed_by: "caja-1",
          claimed_at: now,
          lease_expires_at: new Date(now.getTime() + 300000),
          completed_at: null,
          failed_at: null,
          fail_reason: null,
          idempotency_key: null,
          source: "auto",
          created_at: now,
          updated_at: now,
        }),
        Object.assign(new PrintJob(), {
          id: "j2",
          product_id: "p2",
          sku: "SKU-2",
          product_name: "Product 2",
          sale_price: "200.00",
          status: "claimed",
          claimed_by: "caja-1",
          claimed_at: now,
          lease_expires_at: new Date(now.getTime() + 300000),
          completed_at: null,
          failed_at: null,
          fail_reason: null,
          idempotency_key: null,
          source: "auto",
          created_at: now,
          updated_at: now,
        }),
      ];
      mockClaimBatch.execute.mockResolvedValue(jobs);

      const ctrl = controller as any;
      const result = await ctrl.claimBatch(dto);

      expect(result).toHaveLength(2);
      const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
      for (const r of result) {
        // Required dates must serialize as ISO strings
        expect(r.created_at).toMatch(isoRegex);
        expect(r.updated_at).toMatch(isoRegex);
        expect(r.created_at).not.toContain("Invalid");
        expect(r.updated_at).not.toContain("Invalid");
        // Nullable dates: null → null, real → ISO
        expect(r.completed_at).toBeNull();
        expect(r.failed_at).toBeNull();
        expect(r.claimed_at).toMatch(isoRegex);
        expect(r.lease_expires_at).toMatch(isoRegex);
        expect(r.claimed_at).not.toContain("Invalid");
        expect(r.lease_expires_at).not.toContain("Invalid");
      }
    });
  });

  describe("POST claim-batch/continue", () => {
    it("calls ClaimBatchContinueUseCase.execute with the DTO fields", async () => {
      const dto: ClaimBatchContinueDto = {
        installation: "caja-1",
        limit: 10,
        lease_seconds: 60,
        cursor: null,
      };
      const job = Object.assign(new PrintJob(), {
        id: "j1",
        product_id: "p1",
        sku: "SKU",
        product_name: "P",
        sale_price: "10.00",
        status: "claimed",
        claimed_by: "caja-1",
        created_at: new Date(),
        updated_at: new Date(),
      });
      mockClaimBatchContinue.execute.mockResolvedValue({
        jobs: [job],
        next_cursor: "abc",
        has_more: true,
      });

      const ctrl = controller as any;
      const result = await ctrl.claimBatchContinue(dto);

      expect(mockClaimBatchContinue.execute).toHaveBeenCalledWith({
        installation: "caja-1",
        limit: 10,
        lease_seconds: 60,
        cursor: null,
      });
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].id).toBe("j1");
      expect(result.next_cursor).toBe("abc");
      expect(result.has_more).toBe(true);
    });

    it("keeps the legacy claim-batch route returning a raw array", () => {
      const ctrl = controller as any;
      expect(typeof ctrl.claimBatch).toBe("function");
      expect(typeof ctrl.claimBatchContinue).toBe("function");
    });
  });

  describe("POST :id/block", () => {
    it("calls BlockJobUseCase.execute with id, installation, reason", async () => {
      const dto: BlockJobDto = { installation: "caja-1", reason: "Manual review" };
      const now = new Date("2026-03-01T12:00:00Z");
      const job = Object.assign(new PrintJob(), {
        id: "j1",
        status: "blocked_for_review",
        blocked_reason: "Manual review",
        blocked_by: "caja-1",
        blocked_at: now,
        created_at: now,
        updated_at: now,
      });
      mockBlockJob.execute.mockResolvedValue(job);

      const ctrl = controller as any;
      const result = await ctrl.block("j1", dto);

      expect(mockBlockJob.execute).toHaveBeenCalledWith("j1", "caja-1", "Manual review");
      expect(result.status).toBe("blocked_for_review");
      expect(result.blocked_reason).toBe("Manual review");
      expect(result.blocked_by).toBe("caja-1");
      expect(result.blocked_at).toBe(now.toISOString());
    });

    it("serializes blocked audit fields as null for non-blocked jobs", async () => {
      const dto: BlockJobDto = { installation: "caja-1", reason: "Manual review" };
      const job = Object.assign(new PrintJob(), {
        id: "j1",
        status: "claimed",
        blocked_reason: null,
        blocked_by: null,
        blocked_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      });
      mockBlockJob.execute.mockResolvedValue(job);

      const ctrl = controller as any;
      const result = await ctrl.block("j1", dto);

      expect(result.blocked_reason).toBeNull();
      expect(result.blocked_by).toBeNull();
      expect(result.blocked_at).toBeNull();
    });
  });

});

describe("PrintJobController route metadata", () => {
  interface RouteEntry {
    name: string;
    path: string;
    method: RequestMethod;
  }

  function methodRoutes(): RouteEntry[] {
    const proto = PrintJobController.prototype;
    const entries: RouteEntry[] = [];
    for (const name of Object.getOwnPropertyNames(proto)) {
      if (name === "constructor") continue;
      const target = (proto as unknown as Record<string, unknown>)[name] as object;
      const path = Reflect.getMetadata("path", target) as string | undefined;
      const method = Reflect.getMetadata("method", target) as
        | RequestMethod
        | undefined;
      if (path !== undefined && method !== undefined) {
        entries.push({ name, path, method });
      }
    }
    return entries;
  }

  it("registers the continuation endpoint as a static POST route", () => {
    const entry = methodRoutes().find((e) => e.path === "claim-batch/continue");
    expect(entry).toBeDefined();
    expect(entry!.method).toBe(RequestMethod.POST);
  });

  it("keeps the legacy claim-batch endpoint as a static POST route", () => {
    const entry = methodRoutes().find((e) => e.path === "claim-batch");
    expect(entry).toBeDefined();
    expect(entry!.method).toBe(RequestMethod.POST);
  });

  it("registers the block endpoint as a POST route", () => {
    const entry = methodRoutes().find((e) => e.path === ":id/block");
    expect(entry).toBeDefined();
    expect(entry!.method).toBe(RequestMethod.POST);
  });

  it("declares every static route before parameterized :id routes", () => {
    const entries = methodRoutes();
    const firstParamIndex = entries.findIndex((e) => e.path.includes(":id"));
    expect(firstParamIndex).toBeGreaterThan(-1);

    const staticEntries = entries.filter((e) => !e.path.includes(":id"));
    expect(staticEntries.length).toBeGreaterThan(0);
    for (const entry of staticEntries) {
      expect(entries.indexOf(entry)).toBeLessThan(firstParamIndex);
    }
  });
});
