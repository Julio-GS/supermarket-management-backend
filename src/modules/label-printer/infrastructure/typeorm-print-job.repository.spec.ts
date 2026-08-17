import { TypeOrmPrintJobRepository } from "./typeorm-print-job.repository";
import { PrintJobEntity } from "./typeorm-print-job.entity";
import { PrintJob, PrintJobStatus } from "../domain/print-job.entity";

function mockRepo(overrides: Partial<Record<string, jest.Mock>> = {}) {
  return {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
    ...overrides,
  } as any;
}

describe("TypeOrmPrintJobRepository", () => {
  let repo: TypeOrmPrintJobRepository;
  let mockProductRepo: any;

  beforeEach(() => {
    mockProductRepo = mockRepo();
    repo = new TypeOrmPrintJobRepository(mockProductRepo);
  });

  describe("create", () => {
    it("creates and saves a print job with idempotency_key", async () => {
      const entity = { id: "j1", product_id: "p1", idempotency_key: "ik-1" } as PrintJobEntity;
      mockProductRepo.create.mockReturnValue(entity);
      mockProductRepo.save.mockResolvedValue(entity);

      const result = await repo.create({
        product_id: "p1",
        sku: "7791234000001",
        product_name: "Leche",
        sale_price: "1250.50",
        idempotency_key: "ik-1",
      });

      expect(mockProductRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          product_id: "p1",
          sku: "7791234000001",
          product_name: "Leche",
          sale_price: "1250.50",
          idempotency_key: "ik-1",
          status: "pending",
        }),
      );
      expect(result.id).toBe("j1");
    });

    it("defaults idempotency_key to null when omitted", async () => {
      const entity = { id: "j2", idempotency_key: null } as PrintJobEntity;
      mockProductRepo.create.mockReturnValue(entity);
      mockProductRepo.save.mockResolvedValue(entity);

      const result = await repo.create({
        product_id: "p2",
        sku: "7790000000001",
        product_name: "Pan",
        sale_price: "500.00",
      });

      expect(mockProductRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ idempotency_key: null }),
      );
    });

    it("accepts source field for auto label jobs", async () => {
      const entity = { id: "j3", source: "auto" } as PrintJobEntity;
      mockProductRepo.create.mockReturnValue(entity);
      mockProductRepo.save.mockResolvedValue(entity);

      await repo.create({
        product_id: "p3",
        sku: "779",
        product_name: "Auto Product",
        sale_price: "300.00",
        source: "auto",
      });

      expect(mockProductRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ source: "auto" }),
      );
    });
  });

  describe("findPending", () => {
    it("returns jobs with status pending or failed, ordered by created_at ASC", async () => {
      const entities = [
        { id: "j1", status: "pending", created_at: new Date("2026-01-01") },
        { id: "j2", status: "failed", created_at: new Date("2026-01-02") },
      ] as PrintJobEntity[];

      const mockQb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(entities),
      };
      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await repo.findPending();

      expect(mockQb.where).toHaveBeenCalledWith(
        "print_job.status IN (:...statuses)",
        expect.objectContaining({ statuses: ["pending", "failed"] }),
      );
      expect(mockQb.orderBy).toHaveBeenCalledWith("print_job.created_at", "ASC");
      expect(result).toHaveLength(2);
      expect(result[0].status).toBe("pending");
      expect(result[1].status).toBe("failed");
    });

    it("excludes superseded jobs from the claimable pool", async () => {
      const entities = [
        { id: "j1", status: "pending", created_at: new Date("2026-01-01") },
      ] as PrintJobEntity[];

      const mockQb = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(entities),
      };
      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await repo.findPending();

      // superseded must not be in the claimable statuses
      expect(mockQb.where).toHaveBeenCalledWith(
        "print_job.status IN (:...statuses)",
        expect.objectContaining({
          statuses: expect.not.arrayContaining(["superseded"]),
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  describe("claimNext", () => {
    it("returns the claimed job via UPDATE ... RETURNING * without a separate findOne", async () => {
      const returnedRow = {
        id: "j1",
        status: "claimed",
        claimed_by: "caja-1",
        claimed_at: new Date(),
        lease_expires_at: new Date(Date.now() + 30000),
        product_id: "p1",
        sku: "779",
        product_name: "Leche",
        sale_price: "1250.50",
        created_at: new Date(),
        updated_at: new Date(),
        completed_at: null,
        failed_at: null,
        fail_reason: null,
        idempotency_key: null,
      };

      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1, raw: [returnedRow] }),
      };

      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockProductRepo.findOne.mockResolvedValue(null);

      const result = await repo.claimNext("caja-1", 30000);

      expect(result).not.toBeNull();
      expect(result!.id).toBe("j1");
      expect(result!.status).toBe("claimed");
      expect(result!.claimed_by).toBe("caja-1");
      expect(mockProductRepo.findOne).not.toHaveBeenCalled();
      expect(mockQb.returning).toHaveBeenCalledWith("*");
    });

    it("returns null when no claimable jobs exist (affected=0)", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
      };

      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await repo.claimNext("caja-1", 30000);

      expect(result).toBeNull();
      expect(mockProductRepo.findOne).not.toHaveBeenCalled();
    });

    it("includes claimed jobs with expired leases in the candidate pool", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
      };

      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      await repo.claimNext("caja-1", 30000);

      const allCalls = [
        ...mockQb.where.mock.calls.flat(),
        ...mockQb.andWhere.mock.calls.flat(),
      ].join(" ");
      expect(allCalls).toMatch(/lease_expires_at/);
      expect(allCalls).toMatch(/claimed/);
    });

    it("excludes superseded jobs from the candidate pool via the inner subquery", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
      };

      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      await repo.claimNext("caja-1", 30000);

      // superseded must never appear as a claimable status
      const allCalls = [
        ...mockQb.where.mock.calls.flat(),
        ...mockQb.andWhere.mock.calls.flat(),
      ].join(" ");
      expect(allCalls).not.toMatch(/superseded/);
    });
  });

  describe("complete", () => {
    it("completes only a job claimed by the same installation with a valid lease", async () => {
      const entity = {
        id: "j1",
        status: "completed",
        claimed_by: "caja-1",
        completed_at: expect.any(Date),
      } as PrintJobEntity;

      mockProductRepo.findOne.mockResolvedValue(entity);

      mockProductRepo.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const result = await repo.complete("j1", "caja-1");

      expect(result).not.toBeNull();
      expect(result!.status).toBe("completed");
    });

    it("returns null if the installation does not match", async () => {
      mockProductRepo.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      });

      const result = await repo.complete("j1", "otra-caja");

      expect(result).toBeNull();
    });

    it("adds lease_expires_at > NOW() to the WHERE clause", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockProductRepo.findOne.mockResolvedValue({ id: "j1", status: "completed" } as PrintJobEntity);

      await repo.complete("j1", "caja-1");

      const allCalls = [
        ...mockQb.where.mock.calls.flat(),
        ...mockQb.andWhere.mock.calls.flat(),
      ].join(" ");
      expect(allCalls).toMatch(/lease_expires_at/);
    });

    it("returns null when lease is expired (affected=0)", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await repo.complete("j1", "caja-1");

      expect(result).toBeNull();
    });
  });

  describe("fail", () => {
    it("marks the job as failed with a reason, only for the same installation with valid lease", async () => {
      const entity = {
        id: "j1",
        status: "failed",
        claimed_by: "caja-1",
        failed_at: expect.any(Date),
        fail_reason: "Printer offline",
      } as PrintJobEntity;

      mockProductRepo.findOne.mockResolvedValue(entity);

      mockProductRepo.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      });

      const result = await repo.fail("j1", "caja-1", "Printer offline");

      expect(result).not.toBeNull();
      expect(result!.status).toBe("failed");
      expect(result!.fail_reason).toBe("Printer offline");
    });

    it("returns null if the installation does not match", async () => {
      mockProductRepo.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      });

      const result = await repo.fail("j1", "otra-caja", "offline");

      expect(result).toBeNull();
    });

    it("adds lease_expires_at > NOW() to the WHERE clause", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);
      mockProductRepo.findOne.mockResolvedValue({ id: "j1", status: "failed" } as PrintJobEntity);

      await repo.fail("j1", "caja-1", "offline");

      const allCalls = [
        ...mockQb.where.mock.calls.flat(),
        ...mockQb.andWhere.mock.calls.flat(),
      ].join(" ");
      expect(allCalls).toMatch(/lease_expires_at/);
    });

    it("returns null when lease is expired (affected=0)", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };

      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await repo.fail("j1", "caja-1", "offline");

      expect(result).toBeNull();
    });
  });

  describe("expireLeases", () => {
    it("resets expired claimed jobs back to pending status", async () => {
      mockProductRepo.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 3 }),
      });

      const count = await repo.expireLeases();

      expect(count).toBe(3);
    });

    it("returns 0 when no leases are expired", async () => {
      mockProductRepo.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      });

      const count = await repo.expireLeases();

      expect(count).toBe(0);
    });
  });

  describe("claimBatchContinuing", () => {
    let txQuery: jest.Mock;

    beforeEach(() => {
      txQuery = jest.fn();
      mockProductRepo.manager = {
        transaction: jest.fn(
          async (cb: (m: { query: jest.Mock }) => Promise<unknown>) =>
            cb({ query: txQuery }),
        ),
      };
    });

    function candidate(id: string, createdAt: Date) {
      return { id, created_at: createdAt };
    }

    function claimedRow(id: string, createdAt: Date): Record<string, unknown> {
      const now = new Date();
      return {
        id,
        status: "claimed",
        claimed_by: "caja-1",
        claimed_at: now,
        lease_expires_at: new Date(now.getTime() + 60_000),
        product_id: "p1",
        sku: "SKU",
        product_name: "P",
        sale_price: "10.00",
        created_at: createdAt,
        updated_at: now,
        completed_at: null,
        failed_at: null,
        fail_reason: null,
        idempotency_key: null,
        source: null,
      };
    }

    it("selects limit+1 candidates with tuple predicate and FOR UPDATE SKIP LOCKED", async () => {
      txQuery.mockImplementation(async (sql: string) =>
        /^\s*SELECT/.test(sql) ? [] : [[], 0],
      );

      await repo.claimBatchContinuing({
        installation: "caja-1",
        leaseExpiresAt: new Date(),
        limit: 45,
        after: { created_at: new Date("2026-01-01T00:00:00Z"), id: "some-id" },
      });

      const selectSql = txQuery.mock.calls[0][0] as string;
      const selectParams = txQuery.mock.calls[0][1] as unknown[];
      expect(selectSql).toContain("FOR UPDATE SKIP LOCKED");
      expect(selectSql).toContain("ORDER BY created_at ASC, id ASC");
      expect(selectSql).toContain("LIMIT $1");
      expect(selectSql).toContain("(created_at, id) >");
      expect(selectParams[0]).toBe(46); // limit + 1
    });

    it("updates only the first limit rows and never the lookahead", async () => {
      const candidates = Array.from({ length: 46 }, (_, i) =>
        candidate(`job-${i + 1}`, new Date(2026, 0, 1, 0, 0, i)),
      );
      txQuery.mockImplementationOnce(async () => candidates);
      txQuery.mockImplementationOnce(async () => [
        candidates.slice(0, 45).map((c) => claimedRow(c.id, c.created_at)),
        45,
      ]);

      const result = await repo.claimBatchContinuing({
        installation: "caja-1",
        leaseExpiresAt: new Date(),
        limit: 45,
      });

      expect(result.jobs).toHaveLength(45);
      expect(result.hasMore).toBe(true);
      const updateParams = txQuery.mock.calls[1][1] as unknown[];
      expect(updateParams).toContain("job-45");
      expect(updateParams).not.toContain("job-46");
    });

    it("sets hasMore false when there are no more than limit candidates", async () => {
      const c = candidate("job-1", new Date("2026-01-01"));
      txQuery.mockImplementationOnce(async () => [c]);
      txQuery.mockImplementationOnce(async () => [
        [claimedRow(c.id, c.created_at)],
        1,
      ]);

      const result = await repo.claimBatchContinuing({
        installation: "caja-1",
        leaseExpiresAt: new Date(),
        limit: 45,
      });

      expect(result.hasMore).toBe(false);
      expect(result.jobs).toHaveLength(1);
    });

    it("throws when the update count does not match the claimed ids", async () => {
      const c1 = candidate("job-1", new Date("2026-01-01"));
      const c2 = candidate("job-2", new Date("2026-01-02"));
      txQuery.mockImplementationOnce(async () => [c1, c2]);
      txQuery.mockImplementationOnce(async () => [
        [claimedRow(c1.id, c1.created_at)],
        1,
      ]);

      await expect(
        repo.claimBatchContinuing({
          installation: "caja-1",
          leaseExpiresAt: new Date(),
          limit: 45,
        }),
      ).rejects.toThrow(/update count mismatch/i);
    });

    it("passes the immutable flow deadline and installation to the UPDATE", async () => {
      const c = candidate("job-1", new Date("2026-01-01"));
      txQuery.mockImplementationOnce(async () => [c]);
      txQuery.mockImplementationOnce(async () => [
        [claimedRow(c.id, c.created_at)],
        1,
      ]);
      const leaseExpiresAt = new Date("2030-01-01T00:00:00Z");

      await repo.claimBatchContinuing({
        installation: "caja-1",
        leaseExpiresAt,
        limit: 45,
      });

      const updateParams = txQuery.mock.calls[1][1] as unknown[];
      expect(updateParams).toContain("caja-1");
      expect(updateParams).toContain(leaseExpiresAt);
    });

    it("sorts returned claimed rows by created_at ASC, id ASC", async () => {
      const c1 = candidate("job-1", new Date("2026-01-01"));
      const c2 = candidate("job-2", new Date("2026-01-02"));
      txQuery.mockImplementationOnce(async () => [c1, c2]);
      txQuery.mockImplementationOnce(async () => [
        [claimedRow(c2.id, c2.created_at), claimedRow(c1.id, c1.created_at)],
        2,
      ]);

      const result = await repo.claimBatchContinuing({
        installation: "caja-1",
        leaseExpiresAt: new Date(),
        limit: 45,
      });

      expect(result.jobs[0].id).toBe("job-1");
      expect(result.jobs[1].id).toBe("job-2");
    });

    it("returns empty result when no candidates exist", async () => {
      txQuery.mockImplementation(async (sql: string) =>
        /^\s*SELECT/.test(sql) ? [] : [[], 0],
      );

      const result = await repo.claimBatchContinuing({
        installation: "caja-1",
        leaseExpiresAt: new Date(),
        limit: 45,
      });

      expect(result).toEqual({ jobs: [], hasMore: false });
    });
  });

  describe("cancelPendingByProduct", () => {
    it("marks stale auto jobs as superseded, not failed", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 2 }),
      };

      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      const count = await repo.cancelPendingByProduct("prod-1");

      expect(count).toBe(2);
      // Must set status to 'superseded'
      expect(mockQb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: "superseded" }),
      );
    });

    it("only cancels auto-source jobs in pending/failed status", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };

      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      await repo.cancelPendingByProduct("prod-1");

      // Check that source='auto' filter was applied
      const andWhereClauses = mockQb.andWhere.mock.calls
        .map((call: string[]) => call[0])
        .join(" ");
      expect(andWhereClauses).toMatch(/source = 'auto'/);
      expect(andWhereClauses).toMatch(/status IN/);
    });

    // ── claimBatch ────────────────────────────────────────────────────
    describe("claimBatch", () => {
      it("returns claimed jobs via CTE UPDATE ... RETURNING * with deterministic created_at order", async () => {
        const now = new Date();
        const rows = [
          { id: "j2", status: "claimed", claimed_by: "caja-1", claimed_at: now, lease_expires_at: new Date(now.getTime() + 300000), product_id: "p2", sku: "779-b", product_name: "Pan", sale_price: "500.00", created_at: new Date("2026-01-02"), updated_at: now, completed_at: null, failed_at: null, fail_reason: null, idempotency_key: null, source: "auto" },
          { id: "j1", status: "claimed", claimed_by: "caja-1", claimed_at: now, lease_expires_at: new Date(now.getTime() + 300000), product_id: "p1", sku: "779-a", product_name: "Leche", sale_price: "1250.50", created_at: new Date("2026-01-01"), updated_at: now, completed_at: null, failed_at: null, fail_reason: null, idempotency_key: null, source: "auto" },
        ];

        mockProductRepo.query = jest.fn().mockResolvedValue(rows);

        const result = await repo.claimBatch("caja-1", 300000, 5);

        // Must use repo.query() (raw CTE)
        expect(mockProductRepo.query).toHaveBeenCalledTimes(1);
        const sql: string = mockProductRepo.query.mock.calls[0][0];
        expect(sql).toMatch(/WITH candidates AS/);
        expect(sql).toMatch(/FOR UPDATE SKIP LOCKED/);
        expect(sql).toMatch(/RETURNING/);
        expect(sql).toContain("label_print_jobs");

        // Deterministic ordering restores created_at ASC
        expect(result).toHaveLength(2);
        expect(result[0].id).toBe("j1"); // older first
        expect(result[1].id).toBe("j2");
        expect(result[0].status).toBe("claimed");
        expect(result[0].claimed_by).toBe("caja-1");
      });

      it("returns empty array when no claimable jobs", async () => {
        mockProductRepo.query = jest.fn().mockResolvedValue([]);

        const result = await repo.claimBatch("caja-1", 300000, 3);

        expect(result).toEqual([]);
      });

      it("ensures superseded jobs are excluded from the CTE candidate pool", async () => {
        mockProductRepo.query = jest.fn().mockResolvedValue([]);

        await repo.claimBatch("caja-1", 300000, 5);

        const sql: string = mockProductRepo.query.mock.calls[0][0];
        expect(sql).not.toMatch(/superseded/);
        // Pending and failed are the only explicit candidates
        expect(sql).toMatch(/pending/);
        expect(sql).toMatch(/failed/);
      });

      it("includes expired claimed jobs in the candidate pool", async () => {
        mockProductRepo.query = jest.fn().mockResolvedValue([]);

        await repo.claimBatch("caja-1", 300000, 5);

        const sql: string = mockProductRepo.query.mock.calls[0][0];
        expect(sql).toMatch(/claimed/);
        expect(sql).toMatch(/lease_expires_at/);
      });

      it("passes limit, installation, and computed lease_expires_at as parameters", async () => {
        mockProductRepo.query = jest.fn().mockResolvedValue([]);

        await repo.claimBatch("caja-2", 60000, 10);

        const params = mockProductRepo.query.mock.calls[0][1];
        expect(params[0]).toBe(10); // limit
        expect(params).toContain("caja-2"); // installation
        // lease_expires_at is a Date computed from now + leaseMs
        const leaseParam = params[params.length - 1];
        expect(leaseParam instanceof Date).toBe(true);
      });

      it("returns 5 distinct rows when 5 claimable jobs exist", async () => {
        const now = new Date();
        const rows = [1, 2, 3, 4, 5].map((n) => ({
          id: `job-${n}`,
          status: "claimed",
          claimed_by: "caja-1",
          claimed_at: now,
          lease_expires_at: new Date(now.getTime() + 300000),
          product_id: `p${n}`,
          sku: `SKU-${n}`,
          product_name: `Product ${n}`,
          sale_price: `${n}00.00`,
          created_at: new Date(`2026-01-0${n}`),
          updated_at: now,
          completed_at: null,
          failed_at: null,
          fail_reason: null,
          idempotency_key: null,
          source: "auto",
        }));

        mockProductRepo.query = jest.fn().mockResolvedValue(rows);

        const result = await repo.claimBatch("caja-1", 300000, 5);

        expect(result).toHaveLength(5);
        const ids = result.map((r) => r.id);
        expect(new Set(ids).size).toBe(5);
      });

      it("ensures no duplicate job IDs are returned", async () => {
        const now = new Date();
        const rawRow = {
          id: "job-dup",
          status: "claimed",
          claimed_by: "caja-1",
          claimed_at: now,
          lease_expires_at: new Date(now.getTime() + 300000),
          product_id: "p1",
          sku: "SKU-1",
          product_name: "Product 1",
          sale_price: "100.00",
          created_at: new Date("2026-01-01"),
          updated_at: now,
          completed_at: null,
          failed_at: null,
          fail_reason: null,
          idempotency_key: null,
          source: "auto",
        };

        // Simulate RETURNING returns the same row twice (pathological)
        mockProductRepo.query = jest.fn().mockResolvedValue([rawRow, rawRow]);

        const result = await repo.claimBatch("caja-1", 300000, 5);

        // The CTE + FOR UPDATE SKIP LOCKED prevents this at DB level,
        // but the repo should still return what the DB gives.
        // Deduplication is the frontend's responsibility.
        expect(result).toHaveLength(2);
      });

      it("uses id as tie-breaker when created_at values are equal, both in SQL and JS sort", async () => {
        const sameMoment = new Date("2026-01-15T10:00:00Z");
        const now = new Date();

        // RETURNING order is non-deterministic — rows arrive with equal created_at
        // but unordered by id. The JS fallback sort must restore id-asc as tie-break.
        const rows = [
          { id: "j3", status: "claimed", claimed_by: "caja-1", claimed_at: now, lease_expires_at: new Date(now.getTime() + 300000), product_id: "p3", sku: "779-c", product_name: "C", sale_price: "300.00", created_at: sameMoment, updated_at: now, completed_at: null, failed_at: null, fail_reason: null, idempotency_key: null, source: "auto" },
          { id: "j1", status: "claimed", claimed_by: "caja-1", claimed_at: now, lease_expires_at: new Date(now.getTime() + 300000), product_id: "p1", sku: "779-a", product_name: "A", sale_price: "100.00", created_at: sameMoment, updated_at: now, completed_at: null, failed_at: null, fail_reason: null, idempotency_key: null, source: "auto" },
          { id: "j2", status: "claimed", claimed_by: "caja-1", claimed_at: now, lease_expires_at: new Date(now.getTime() + 300000), product_id: "p2", sku: "779-b", product_name: "B", sale_price: "200.00", created_at: sameMoment, updated_at: now, completed_at: null, failed_at: null, fail_reason: null, idempotency_key: null, source: "auto" },
        ];

        mockProductRepo.query = jest.fn().mockResolvedValue(rows);

        const result = await repo.claimBatch("caja-1", 300000, 10);

        // RED: with only created_at sorting, the tie-break is non-deterministic.
        // The correct ordering is created_at ASC, id ASC.
        expect(result).toHaveLength(3);
        expect(result[0].id).toBe("j1");
        expect(result[1].id).toBe("j2");
        expect(result[2].id).toBe("j3");

        // SQL must also include id in the ORDER BY clause
        const sql: string = mockProductRepo.query.mock.calls[0][0];
        expect(sql).toMatch(/ORDER BY created_at ASC,\s*id ASC/);
      });

      // ── Tuple normalization (RED — fails until normalizeRawRows is implemented) ──
      it("normalizes PostgreSQL [rows[], rowCount] tuple into 5 domain jobs", async () => {
        const now = new Date();
        const row = (n: number) => ({
          id: `job-${n}`,
          status: "claimed",
          claimed_by: "caja-1",
          claimed_at: now,
          lease_expires_at: new Date(now.getTime() + 300000),
          product_id: `p${n}`,
          sku: `SKU-${n}`,
          product_name: `Product ${n}`,
          sale_price: `${n}00.00`,
          created_at: new Date(`2026-01-0${n}`),
          updated_at: now,
          completed_at: null,
          failed_at: null,
          fail_reason: null,
          idempotency_key: null,
          source: "auto",
        });

        const rows = [row(1), row(2), row(3), row(4), row(5)];
        // Real pg driver shape: [rows[], rowCount]
        mockProductRepo.query = jest.fn().mockResolvedValue([rows, 5]);

        const result = await repo.claimBatch("caja-1", 300000, 5);

        expect(result).toHaveLength(5);
        const ids = result.map((r) => r.id);
        expect(new Set(ids).size).toBe(5);
        // created_at sorting: row(1) = Jan-01, row(5) = Jan-05
        expect(result[0].id).toBe("job-1");
        expect(result[4].id).toBe("job-5");
        // Dates must be real Date instances, not Invalid Date
        expect(result[0].created_at instanceof Date).toBe(true);
        expect(isNaN(result[0].created_at.getTime())).toBe(false);
      });

      it("accepts flat row arrays (backward compatibility with existing tests and non-pg drivers)", async () => {
        const now = new Date();
        const rows = [
          { id: "j1", status: "claimed", claimed_by: "caja-1", claimed_at: now, lease_expires_at: new Date(now.getTime() + 300000), product_id: "p1", sku: "779-a", product_name: "A", sale_price: "100.00", created_at: new Date("2026-01-01"), updated_at: now, completed_at: null, failed_at: null, fail_reason: null, idempotency_key: null, source: "auto" },
        ];

        mockProductRepo.query = jest.fn().mockResolvedValue(rows);

        const result = await repo.claimBatch("caja-1", 300000, 5);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("j1");
        expect(result[0].created_at instanceof Date).toBe(true);
        expect(isNaN(result[0].created_at.getTime())).toBe(false);
      });

      it("returns empty array for empty tuple [[], 0]", async () => {
        mockProductRepo.query = jest.fn().mockResolvedValue([[], 0]);

        const result = await repo.claimBatch("caja-1", 300000, 5);

        expect(result).toEqual([]);
      });

      it("throws on malformed tuple: non-array rows slot", async () => {
        mockProductRepo.query = jest.fn().mockResolvedValue([null, 0]);

        await expect(repo.claimBatch("caja-1", 300000, 5)).rejects.toThrow(
          /claimBatch.*raw query result/i,
        );
      });

      it("throws on malformed tuple: non-numeric count slot", async () => {
        mockProductRepo.query = jest.fn().mockResolvedValue([[], "not-a-number"]);

        await expect(repo.claimBatch("caja-1", 300000, 5)).rejects.toThrow(
          /claimBatch.*raw query result/i,
        );
      });

      it("throws on non-array raw result (string)", async () => {
        mockProductRepo.query = jest.fn().mockResolvedValue("not-an-array");

        await expect(repo.claimBatch("caja-1", 300000, 5)).rejects.toThrow(
          /claimBatch.*array/i,
        );
      });

      it("throws on non-array raw result (object)", async () => {
        mockProductRepo.query = jest.fn().mockResolvedValue({ rows: [] });

        await expect(repo.claimBatch("caja-1", 300000, 5)).rejects.toThrow(
          /claimBatch.*array/i,
        );
      });

      // ── rowToDomain date hardening (RED — fails until date parsers are hardened) ──
      it("throws when required created_at is an invalid date string", async () => {
        const now = new Date();
        const badRow = {
          id: "j1", status: "claimed", claimed_by: "caja-1", claimed_at: now,
          lease_expires_at: new Date(now.getTime() + 300000),
          product_id: "p1", sku: "779", product_name: "X", sale_price: "100.00",
          created_at: "not-a-date",
          updated_at: now,
          completed_at: null, failed_at: null, fail_reason: null,
          idempotency_key: null, source: "auto",
        };

        mockProductRepo.query = jest.fn().mockResolvedValue([badRow]);

        await expect(repo.claimBatch("caja-1", 300000, 5)).rejects.toThrow(
          /created_at/i,
        );
      });

      it("throws when required updated_at is an invalid date string", async () => {
        const now = new Date();
        const badRow = {
          id: "j1", status: "claimed", claimed_by: "caja-1", claimed_at: now,
          lease_expires_at: new Date(now.getTime() + 300000),
          product_id: "p1", sku: "779", product_name: "X", sale_price: "100.00",
          created_at: now,
          updated_at: "invalid-value",
          completed_at: null, failed_at: null, fail_reason: null,
          idempotency_key: null, source: "auto",
        };

        mockProductRepo.query = jest.fn().mockResolvedValue([badRow]);

        await expect(repo.claimBatch("caja-1", 300000, 5)).rejects.toThrow(
          /updated_at/i,
        );
      });

      it("throws when required created_at is missing (undefined)", async () => {
        const now = new Date();
        const badRow = {
          id: "j1", status: "claimed", claimed_by: "caja-1", claimed_at: now,
          lease_expires_at: new Date(now.getTime() + 300000),
          product_id: "p1", sku: "779", product_name: "X", sale_price: "100.00",
          updated_at: now,
          completed_at: null, failed_at: null, fail_reason: null,
          idempotency_key: null, source: "auto",
        };

        mockProductRepo.query = jest.fn().mockResolvedValue([badRow]);

        await expect(repo.claimBatch("caja-1", 300000, 5)).rejects.toThrow(
          /created_at/i,
        );
      });

      it("throws when nullable claimed_at is present but invalid", async () => {
        const now = new Date();
        const badRow = {
          id: "j1", status: "claimed", claimed_by: "caja-1",
          claimed_at: "bogus-date",
          lease_expires_at: new Date(now.getTime() + 300000),
          product_id: "p1", sku: "779", product_name: "X", sale_price: "100.00",
          created_at: now, updated_at: now,
          completed_at: null, failed_at: null, fail_reason: null,
          idempotency_key: null, source: "auto",
        };

        mockProductRepo.query = jest.fn().mockResolvedValue([badRow]);

        await expect(repo.claimBatch("caja-1", 300000, 5)).rejects.toThrow(
          /claimed_at/i,
        );
      });

      it("throws when nullable lease_expires_at is present but invalid", async () => {
        const now = new Date();
        const badRow = {
          id: "j1", status: "claimed", claimed_by: "caja-1", claimed_at: now,
          lease_expires_at: "garbage",
          product_id: "p1", sku: "779", product_name: "X", sale_price: "100.00",
          created_at: now, updated_at: now,
          completed_at: null, failed_at: null, fail_reason: null,
          idempotency_key: null, source: "auto",
        };

        mockProductRepo.query = jest.fn().mockResolvedValue([badRow]);

        await expect(repo.claimBatch("caja-1", 300000, 5)).rejects.toThrow(
          /lease_expires_at/i,
        );
      });
    });

    it("returns 0 when no auto jobs to cancel", async () => {
      mockProductRepo.createQueryBuilder = jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      });

      const count = await repo.cancelPendingByProduct("prod-none");

      expect(count).toBe(0);
    });

    it("uses the transaction runner's repository when provided", async () => {
      const runnerRepo = mockRepo();
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      runnerRepo.createQueryBuilder.mockReturnValue(mockQb);

      const runner: any = {
        manager: { getRepository: jest.fn().mockReturnValue(runnerRepo) },
      };

      await repo.cancelPendingByProduct("prod-1", runner);

      expect(runner.manager.getRepository).toHaveBeenCalled();
      expect(runnerRepo.createQueryBuilder).toHaveBeenCalled();
    });

    it("supersedes auto claimed jobs whose lease has expired", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      await repo.cancelPendingByProduct("prod-1");

      // Must include claimed + lease_expires_at in the WHERE clause
      const allClauses = mockQb.andWhere.mock.calls
        .map((call: string[]) => call[0])
        .join(" ");
      expect(allClauses).toMatch(/claimed/);
      expect(allClauses).toMatch(/lease_expires_at/);
      expect(allClauses).toMatch(/NOW\(\)/);
    });

    it("does not supersede actively leased claimed jobs (lease not expired)", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      await repo.cancelPendingByProduct("prod-1");

      const allClauses = mockQb.andWhere.mock.calls
        .map((call: string[]) => call[0])
        .join(" ");
      // lease condition must use strict less-than, not less-than-or-equal
      expect(allClauses).toMatch(/lease_expires_at\s*<\s*NOW\(\)/);
    });

    it("never touches completed jobs or manual-source jobs", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      await repo.cancelPendingByProduct("prod-1");

      const allClauses = mockQb.andWhere.mock.calls
        .map((call: string[]) => call[0])
        .join(" ");
      // Must filter to auto-source only (excludes manual)
      expect(allClauses).toMatch(/source = 'auto'/);
      // completed must never appear as a target status
      expect(allClauses).not.toMatch(/completed/);
    });
  });

  describe("findByIdempotencyKey", () => {
    it("returns the job when found by idempotency_key", async () => {
      const entity = { id: "j1", idempotency_key: "ik-1", status: "pending" } as PrintJobEntity;
      mockProductRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findByIdempotencyKey("ik-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("j1");
      expect(mockProductRepo.findOne).toHaveBeenCalledWith({
        where: { idempotency_key: "ik-1" },
      });
    });

    it("returns null when no job has that idempotency_key", async () => {
      mockProductRepo.findOne.mockResolvedValue(null);

      const result = await repo.findByIdempotencyKey("nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("findById", () => {
    it("returns the job when found by id", async () => {
      const entity = { id: "j1", status: "claimed" } as PrintJobEntity;
      mockProductRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findById("j1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("j1");
      expect(mockProductRepo.findOne).toHaveBeenCalledWith({
        where: { id: "j1" },
      });
    });

    it("returns null when the job does not exist", async () => {
      mockProductRepo.findOne.mockResolvedValue(null);

      const result = await repo.findById("missing");

      expect(result).toBeNull();
    });
  });

  describe("block", () => {
    it("blocks a claimed job via the atomic predicate and maps audit fields", async () => {
      const now = new Date("2026-03-01T12:00:00Z");
      const returnedRow = {
        id: "j1",
        status: "blocked_for_review",
        claimed_by: "caja-1",
        blocked_reason: "Manual review",
        blocked_by: "caja-1",
        blocked_at: now,
        product_id: "p1",
        sku: "779",
        product_name: "Leche",
        sale_price: "1250.50",
        claimed_at: now,
        lease_expires_at: new Date(now.getTime() + 30000),
        completed_at: null,
        failed_at: null,
        fail_reason: null,
        idempotency_key: null,
        source: null,
        created_at: now,
        updated_at: now,
      };
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1, raw: [returnedRow] }),
      };
      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await repo.block("j1", "caja-1", "Manual review");

      expect(result).not.toBeNull();
      expect(result!.status).toBe("blocked_for_review");
      expect(result!.blocked_reason).toBe("Manual review");
      expect(result!.blocked_by).toBe("caja-1");
      expect(result!.blocked_at).toEqual(now);
      expect(mockQb.returning).toHaveBeenCalledWith("*");
    });

    it("adds claimed-only + same-installation + valid-lease predicates", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
      };
      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      await repo.block("j1", "caja-1", "reason");

      expect(mockQb.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "blocked_for_review",
          blocked_reason: "reason",
          blocked_by: "caja-1",
          blocked_at: expect.any(Date),
        }),
      );
      const allCalls = [
        ...mockQb.where.mock.calls.flat(),
        ...mockQb.andWhere.mock.calls.flat(),
      ].join(" ");
      expect(allCalls).toMatch(/status = :status/);
      expect(allCalls).toMatch(/claimed_by = :installation/);
      expect(allCalls).toMatch(/lease_expires_at > NOW\(\)/);
    });

    it("returns null when the atomic update affects zero rows", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
      };
      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await repo.block("j1", "caja-1", "reason");

      expect(result).toBeNull();
    });
  });

  describe("blocked_for_review exclusions", () => {
    it("claimNext candidate subquery never includes blocked_for_review", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0, raw: [] }),
      };
      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      await repo.claimNext("caja-1", 30000);

      const allCalls = [
        ...mockQb.where.mock.calls.flat(),
        ...mockQb.andWhere.mock.calls.flat(),
      ].join(" ");
      expect(allCalls).not.toMatch(/blocked_for_review/);
    });

    it("claimBatch SQL candidate pool never includes blocked_for_review", async () => {
      mockProductRepo.query = jest.fn().mockResolvedValue([]);

      await repo.claimBatch("caja-1", 300000, 5);

      const sql: string = mockProductRepo.query.mock.calls[0][0];
      expect(sql).not.toMatch(/blocked_for_review/);
    });

    it("expireLeases only resets status='claimed', never blocked jobs", async () => {
      const mockQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      mockProductRepo.createQueryBuilder.mockReturnValue(mockQb);

      await repo.expireLeases();

      expect(mockQb.where).toHaveBeenCalledWith("status = :status", {
        status: "claimed",
      });
      expect(mockQb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: "pending" }),
      );
    });
  });
});
