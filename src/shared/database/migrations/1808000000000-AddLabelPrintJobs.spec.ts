import { AddLabelPrintJobs1808000000000 } from "./1808000000000-AddLabelPrintJobs";

function mockQueryRunner() {
  const queries: string[] = [];
  return {
    query: jest.fn((sql: string) => {
      queries.push(sql);
      return Promise.resolve();
    }),
    getQueries: () => queries,
  };
}

describe("AddLabelPrintJobs1808000000000", () => {
  let migration: AddLabelPrintJobs1808000000000;

  beforeEach(() => {
    migration = new AddLabelPrintJobs1808000000000();
  });

  it("has the correct migration name", () => {
    expect(migration.name).toBe("AddLabelPrintJobs1808000000000");
  });

  describe("up", () => {
    it("creates the label_print_jobs table", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("CREATE TABLE IF NOT EXISTS label_print_jobs");
    });

    it("includes product_id as a plain UUID column with no FK", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("product_id UUID NOT NULL");
      // Must NOT have a FK reference to products
      expect(sql).not.toMatch(/product_id.*REFERENCES/i);
    });

    it("includes immutable label snapshot columns", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("product_id");
      expect(sql).toContain("sku");
      expect(sql).toContain("product_name");
      expect(sql).toContain("sale_price");
    });

    it("includes job lifecycle columns", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("status");
      expect(sql).toContain("claimed_by");
      expect(sql).toContain("claimed_at");
      expect(sql).toContain("lease_expires_at");
      expect(sql).toContain("completed_at");
      expect(sql).toContain("failed_at");
      expect(sql).toContain("fail_reason");
    });

    it("includes idempotency_key unique column", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("idempotency_key");
      expect(sql).toMatch(/idempotency_key.*UNIQUE/i);
    });

    it("creates the pending-claimable status index", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("idx_label_print_jobs_status");
      expect(sql).toMatch(/WHERE.*status.*IN.*pending/);
    });

    it("creates the claimed_by index", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("idx_label_print_jobs_claimed_by");
    });

    it("creates the lease_expires_at index", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("idx_label_print_jobs_lease_expires");
    });

    it("creates the idempotency_key index", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("idx_label_print_jobs_idempotency_key");
    });

    it("uses NOW() defaults for timestamps", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).toMatch(/created_at.*DEFAULT now\(\)/i);
      expect(sql).toMatch(/updated_at.*DEFAULT now\(\)/i);
    });

    it("does not insert, update, delete, or backfill any products rows", async () => {
      const runner = mockQueryRunner();

      await migration.up(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).not.toMatch(/INSERT INTO products/i);
      expect(sql).not.toMatch(/UPDATE products/i);
      expect(sql).not.toMatch(/DELETE FROM products/i);
      expect(sql).not.toMatch(/ALTER TABLE products/i);
    });
  });

  describe("down", () => {
    it("drops only label_print_jobs structures", async () => {
      const runner = mockQueryRunner();

      await migration.down(runner as any);

      const sql = runner.getQueries().join("\n");
      // Drop indexes first
      expect(sql).toContain("DROP INDEX IF EXISTS idx_label_print_jobs_status");
      expect(sql).toContain("DROP INDEX IF EXISTS idx_label_print_jobs_claimed_by");
      expect(sql).toContain("DROP INDEX IF EXISTS idx_label_print_jobs_lease_expires");
      expect(sql).toContain("DROP INDEX IF EXISTS idx_label_print_jobs_idempotency_key");
      // Then drop the table
      expect(sql).toContain("DROP TABLE IF EXISTS label_print_jobs");
    });

    it("does not touch any products table structures", async () => {
      const runner = mockQueryRunner();

      await migration.down(runner as any);

      const sql = runner.getQueries().join("\n");
      expect(sql).not.toMatch(/products/i);
    });

    it("drops indexes before the table", async () => {
      const runner = mockQueryRunner();

      await migration.down(runner as any);

      const queries = runner.getQueries();
      const tableIdx = queries.findIndex((q) =>
        q.includes("DROP TABLE") && q.includes("label_print_jobs"),
      );
      const lastIndexIdx = queries.reduce((last, q, i) => {
        if (q.includes("DROP INDEX")) return i;
        return last;
      }, -1);
      // All indexes dropped before the table
      expect(lastIndexIdx).toBeLessThan(tableIdx);
    });
  });
});
