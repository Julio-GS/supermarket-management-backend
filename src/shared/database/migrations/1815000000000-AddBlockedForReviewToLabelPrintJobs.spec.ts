import { AddBlockedForReviewToLabelPrintJobs1815000000000 } from "./1815000000000-AddBlockedForReviewToLabelPrintJobs";

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

describe("AddBlockedForReviewToLabelPrintJobs1815000000000", () => {
  let migration: AddBlockedForReviewToLabelPrintJobs1815000000000;

  beforeEach(() => {
    migration = new AddBlockedForReviewToLabelPrintJobs1815000000000();
  });

  it("has the correct migration name", () => {
    expect(migration.name).toBe(
      "AddBlockedForReviewToLabelPrintJobs1815000000000",
    );
  });

  describe("up", () => {
    it("adds nullable blocked audit columns without defaults or DML", async () => {
      const runner = mockQueryRunner();
      await migration.up(runner as any);
      const sql = runner.getQueries().join("\n");
      expect(sql).toContain(
        "ADD COLUMN IF NOT EXISTS blocked_reason varchar(500)",
      );
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS blocked_by varchar(100)");
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS blocked_at timestamptz");
      expect(sql).not.toContain("DEFAULT");
      expect(sql).not.toMatch(/UPDATE\s+label_print_jobs/i);
      expect(sql).not.toMatch(/INSERT\s+INTO|DELETE\s+FROM/i);
    });

    it("adds the coherent blocked audit shape constraint", async () => {
      const runner = mockQueryRunner();
      await migration.up(runner as any);
      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("chk_label_print_jobs_blocked_audit");
      expect(sql).toContain("blocked_for_review");
    });
  });

  describe("down", () => {
    it("drops only the new constraint and columns", async () => {
      const runner = mockQueryRunner();
      await migration.down(runner as any);
      const sql = runner.getQueries().join("\n");
      expect(sql).toContain("chk_label_print_jobs_blocked_audit");
      expect(sql).toContain("DROP COLUMN IF EXISTS blocked_reason");
      expect(sql).toContain("DROP COLUMN IF EXISTS blocked_by");
      expect(sql).toContain("DROP COLUMN IF EXISTS blocked_at");
      expect(sql).not.toMatch(/UPDATE\s+|INSERT\s+INTO|DELETE\s+FROM/i);
    });
  });
});
